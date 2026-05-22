import { useCallback, useEffect, useMemo, useState } from "react";
import ClinicLayout from "../components/ClinicLayout";
import http from "../api/http";
import { createClinicSocket } from "../api/clinicSocket";
import {
  formatAppointmentDate,
  formatAppointmentDateTime,
  getAppointmentDateTime,
  groupAppointmentsByDate,
  sortAppointmentsByDateTime,
} from "../utils/appointmentGroups";

function fallback(value, empty = "Belirtilmemiş") {
  return value && String(value).trim() ? value : empty;
}

function statusText(status) {
  const current = String(status || "").toLowerCase();
  if (current === "cancel_requested") return "İptal Talebi";
  if (current === "cancelled") return "İptal";
  if (current === "completed") return "Tamamlandı";
  if (current === "active") return "Aktif";
  return "Belirtilmemiş";
}

function isPendingCancelRequest(item) {
  return (
    String(item?.status || "").toLowerCase() === "cancel_requested" &&
    String(item?.cancelRequestStatus || "").toLowerCase() === "pending"
  );
}

function sortAppointmentsByDate(items) {
  return sortAppointmentsByDateTime(items, "asc");
}

function mergeAppointmentById(items, incoming) {
  if (!incoming?._id) {
    return sortAppointmentsByDate(items);
  }

  const exists = items.some((item) => item?._id === incoming._id);
  const nextItems = exists
    ? items.map((item) => (item?._id === incoming._id ? incoming : item))
    : [...items, incoming];

  return sortAppointmentsByDate(nextItems);
}

export default function ClinicCancelRequests() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [expandedIds, setExpandedIds] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [modalState, setModalState] = useState({ mode: "", appointment: null });
  const [submitId, setSubmitId] = useState("");
  const [modalError, setModalError] = useState("");

  const fetchAppointments = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setBackgroundRefreshing(true);
    } else {
      setLoading(true);
      setError("");
    }

    try {
      const { data } = await http.get("/api/appointments/clinic");
      setItems(sortAppointmentsByDate(Array.isArray(data) ? data : []));
      setLastUpdated(new Date());
    } catch (e) {
      if (!silent) {
        setError(
          e?.response?.data?.message ||
            "İptal talepleri alınırken bir hata oluştu."
        );
      }
    } finally {
      if (silent) {
        setBackgroundRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    const socket = createClinicSocket();

    const handleConnect = () => {
      setSocketStatus("connected");
      fetchAppointments({ silent: true });
    };

    const handleDisconnect = (reason) => {
      setSocketStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    };

    const handleConnectError = () => {
      setSocketStatus("reconnecting");
    };

    const handleReconnectAttempt = () => {
      setSocketStatus("reconnecting");
    };

    const handleReconnect = () => {
      setSocketStatus("connected");
      fetchAppointments({ silent: true });
    };

    const handleCancelRequested = (appointment) => {
      setItems((prev) => mergeAppointmentById(prev, appointment));
      setLastUpdated(new Date());
    };

    const handleCancelApproved = (appointment) => {
      setItems((prev) => mergeAppointmentById(prev, appointment));
      setLastUpdated(new Date());
    };

    const handleCancelRejected = (appointment) => {
      setItems((prev) => mergeAppointmentById(prev, appointment));
      setLastUpdated(new Date());
    };

    const handleAppointmentUpdated = (appointment) => {
      setItems((prev) => mergeAppointmentById(prev, appointment));
      setLastUpdated(new Date());
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("appointment:cancel_requested", handleCancelRequested);
    socket.on("appointment:cancel_approved", handleCancelApproved);
    socket.on("appointment:cancel_rejected", handleCancelRejected);
    socket.on("appointment:updated", handleAppointmentUpdated);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleReconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("appointment:cancel_requested", handleCancelRequested);
      socket.off("appointment:cancel_approved", handleCancelApproved);
      socket.off("appointment:cancel_rejected", handleCancelRejected);
      socket.off("appointment:updated", handleAppointmentUpdated);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleReconnect);
      socket.disconnect();
    };
  }, [fetchAppointments]);

  const pendingRequests = useMemo(() => {
    return sortAppointmentsByDate(items).filter(isPendingCancelRequest);
  }, [items]);

  const groupedPendingRequests = useMemo(() => {
    return Object.values(groupAppointmentsByDate(pendingRequests));
  }, [pendingRequests]);

  useEffect(() => {
    setExpandedIds((prev) =>
      prev.filter((id) => pendingRequests.some((item) => item?._id === id))
    );
  }, [pendingRequests]);

  useEffect(() => {
    if (
      modalState.appointment &&
      !pendingRequests.some((item) => item?._id === modalState.appointment?._id)
    ) {
      setModalState({ mode: "", appointment: null });
      setModalError("");
    }
  }, [pendingRequests, modalState]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openModal = (mode, appointment) => {
    setModalError("");
    setFeedback({ type: "", message: "" });
    setModalState({ mode, appointment });
  };

  const closeModal = () => {
    if (submitId) return;
    setModalState({ mode: "", appointment: null });
    setModalError("");
  };

  const handleDecision = async () => {
    if (!modalState.appointment?._id || !modalState.mode) return;

    const isApprove = modalState.mode === "approve";
    const endpoint = isApprove
      ? `/api/appointments/${modalState.appointment._id}/approve-cancel-request`
      : `/api/appointments/${modalState.appointment._id}/reject-cancel-request`;

    setSubmitId(modalState.appointment._id);
    setModalError("");

    try {
      const { data } = await http.put(endpoint);

      if (data?.appointment) {
        setItems((prev) => mergeAppointmentById(prev, data.appointment));
      }

      setLastUpdated(new Date());
      setModalState({ mode: "", appointment: null });
      setFeedback({
        type: "success",
        message:
          data?.message ||
          (isApprove
            ? "İptal talebi onaylandı."
            : "İptal talebi reddedildi."),
      });
    } catch (e) {
      const message =
        e?.response?.data?.message ||
        "İşlem sırasında bir hata oluştu.";
      setModalError(message);
      setFeedback({ type: "error", message });
    } finally {
      setSubmitId("");
    }
  };

  const modalTitle =
    modalState.mode === "approve"
      ? "İptal Talebini Onayla"
      : "İptal Talebini Reddet";

  const modalText =
    modalState.mode === "approve"
      ? "Bu randevu iptal talebini onaylamak istediğinize emin misiniz?"
      : "Bu iptal talebini reddetmek istediğinize emin misiniz?";

  return (
    <ClinicLayout
      title="İptal Talepleri"
      description="Kullanıcılardan gelen bekleyen iptal taleplerini burada değerlendirebilirsiniz."
    >
      <div className="clinic-pagehead">
        <div>
          <div className="clinic-badge clinic-badge--soft">Talep Yönetimi</div>
          <h2 className="clinic-section-title">İptal Talepleri</h2>
          <p className="clinic-section-subtitle">
            Yalnızca bekleyen iptal talepleri listelenir. Onay veya red işlemi sonrasında kayıt bu listeden kalkar.
          </p>
        </div>

        <div className="clinic-live-meta">
          <span
            className={`clinic-live-dot clinic-live-dot--${socketStatus} ${
              backgroundRefreshing || socketStatus === "reconnecting" ? "is-refreshing" : ""
            }`}
          />
          <span className="clinic-live-meta__text clinic-live-meta__text--single">
            {lastUpdated
              ? `Son senkron: ${formatAppointmentDateTime(lastUpdated)}`
              : "Son senkron hazırlanıyor"}
          </span>
        </div>
      </div>

      {feedback.message ? (
        <div
          className={`placeholderCard clinic-card clinic-inline-feedback ${
            feedback.type === "error"
              ? "clinic-inline-feedback--error"
              : "clinic-inline-feedback--success"
          }`}
        >
          <p>{feedback.message}</p>
        </div>
      ) : null}

      {loading && groupedPendingRequests.length === 0 ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>İptal talepleri yükleniyor...</h2>
          <p>Kliniğe ait bekleyen iptal talepleri backend üzerinden getiriliyor.</p>
        </div>
      ) : error ? (
        <div className="placeholderCard clinic-card clinic-state-card clinic-state-card--error">
          <h2>Bir sorun oluştu</h2>
          <p>{error}</p>
        </div>
      ) : groupedPendingRequests.length === 0 ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>Bekleyen iptal talebi bulunmamaktadır.</h2>
          <p>Yeni bir kullanıcı iptal talebi oluşturduğunda bu ekran otomatik olarak güncellenecektir.</p>
        </div>
      ) : (
        <div className="clinic-appointment-groups">
          {groupedPendingRequests.map((group) => (
            <section className="clinic-appointment-group" key={group.key}>
              <div className="clinic-group-header">
                <div className="clinic-group-header__accent" aria-hidden="true" />
                <div className="clinic-group-header__content">
                  <h3 className="clinic-group-header__title">{group.title}</h3>
                  <p className="clinic-group-header__count">
                    {group.items.length} talep
                  </p>
                </div>
              </div>

              <div className="clinic-appointments-grid">
                {group.items.map((item) => {
            const fullName = [item?.user?.name, item?.user?.surname]
              .filter(Boolean)
              .join(" ")
              .trim();
            const contact = item?.user?.email || item?.user?.phone || "Belirtilmemiş";
            const apptDate = getAppointmentDateTime(item);
            const isExpanded = expandedIds.includes(item?._id);
            const isSubmitting = submitId === item?._id;

            return (
              <article className="clinic-card clinic-appointment-card" key={item?._id}>
                <button
                  type="button"
                  className="clinic-appointment-card__summary"
                  onClick={() => toggleExpanded(item?._id)}
                >
                  <div className="clinic-appointment-card__top">
                    <div>
                      <div className="clinic-appointment-card__name">
                        {fallback(fullName)}
                      </div>
                      <div className="clinic-appointment-card__meta">
                        {fallback(item?.petName)} {item?.petType ? `• ${item.petType}` : ""}
                      </div>
                      <div className="clinic-appointment-card__meta clinic-appointment-card__meta--subtle">
                        {formatAppointmentDate(apptDate)} • {fallback(item?.time)}
                      </div>
                    </div>

                    <div className="clinic-appointment-card__badges">
                      <span className="clinic-badge clinic-badge--warning">Bekleyen Talep</span>
                      <span className="clinic-badge clinic-badge--status">
                        {statusText(item?.status)}
                      </span>
                      <span className={`clinic-accordion-icon ${isExpanded ? "is-open" : ""}`}>⌄</span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <>
                    <div className="clinic-appointment-card__grid">
                      <div className="clinic-info">
                        <span className="clinic-info__label">KULLANICI</span>
                        <span className="clinic-info__value">{fallback(fullName)}</span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">İLETİŞİM</span>
                        <span className="clinic-info__value">{contact}</span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">EVCİL HAYVAN</span>
                        <span className="clinic-info__value">
                          {fallback(item?.petName)} {item?.petType ? `• ${item.petType}` : ""}
                        </span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">HİZMET / İŞLEM</span>
                        <span className="clinic-info__value">{fallback(item?.serviceType)}</span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">TARİH</span>
                        <span className="clinic-info__value">{formatAppointmentDate(apptDate)}</span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">SAAT</span>
                        <span className="clinic-info__value">{fallback(item?.time)}</span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">DURUM</span>
                        <span className="clinic-info__value">{statusText(item?.status)}</span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">TALEP OLUŞTURULMA</span>
                        <span className="clinic-info__value">
                          {formatAppointmentDateTime(item?.cancelRequestedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="clinic-info clinic-info--full">
                      <span className="clinic-info__label">İPTAL AÇIKLAMASI</span>
                      <span className="clinic-info__value">
                        {fallback(item?.cancelReason, "Belirtilmemiş")}
                      </span>
                    </div>

                    <div className="clinic-request-actions">
                      <button
                        type="button"
                        className="btn clinic-button clinic-button--success"
                        onClick={() => openModal("approve", item)}
                        disabled={isSubmitting}
                      >
                        İptali Onayla
                      </button>

                      <button
                        type="button"
                        className="btn clinic-button clinic-button--danger"
                        onClick={() => openModal("reject", item)}
                        disabled={isSubmitting}
                      >
                        Talebi Reddet
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {modalState.appointment ? (
        <div className="clinic-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="clinic-modal clinic-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clinic-cancel-request-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="clinic-modal__badge">Talep Onayı</div>
            <h3 id="clinic-cancel-request-title" className="clinic-modal__title">
              {modalTitle}
            </h3>
            <p className="clinic-modal__text">{modalText}</p>
            <div className="clinic-modal__summary">
              <strong>{fallback(modalState.appointment?.petName)}</strong>
              <span>
                {formatAppointmentDate(getAppointmentDateTime(modalState.appointment))} •{" "}
                {fallback(modalState.appointment?.time)}
              </span>
            </div>
            {modalError ? <p className="clinic-modal__error">{modalError}</p> : null}
            <div className="clinic-modal__actions">
              <button
                type="button"
                className="btn clinic-button clinic-button--neutral"
                onClick={closeModal}
                disabled={!!submitId}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={`btn clinic-button ${
                  modalState.mode === "approve"
                    ? "clinic-button--success"
                    : "clinic-button--danger"
                }`}
                onClick={handleDecision}
                disabled={!!submitId}
              >
                {submitId
                  ? "İşlem Yapılıyor..."
                  : modalState.mode === "approve"
                    ? "Onayla"
                    : "Reddet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ClinicLayout>
  );
}
