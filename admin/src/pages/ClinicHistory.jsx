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

function historyStatusText(item) {
  const status = String(item?.status || "").toLowerCase();
  const cancelRequestStatus = String(item?.cancelRequestStatus || "").toLowerCase();

  if (status === "cancelled") return "İptal Edildi";
  if (status === "completed") return "Tamamlandı";
  if (status === "active" && cancelRequestStatus === "rejected") {
    return "İptal Talebi Reddedildi";
  }

  return "Geçmiş";
}

function historyStatusClass(item) {
  const status = String(item?.status || "").toLowerCase();
  const cancelRequestStatus = String(item?.cancelRequestStatus || "").toLowerCase();

  if (status === "cancelled") return "clinic-badge--danger-soft";
  if (status === "completed") return "clinic-badge--success-soft";
  if (status === "active" && cancelRequestStatus === "rejected") {
    return "clinic-badge--neutral-soft";
  }

  return "clinic-badge--neutral-soft";
}

function isPastAppointment(item) {
  const status = String(item?.status || "").toLowerCase();
  const cancelRequestStatus = String(item?.cancelRequestStatus || "").toLowerCase();
  const date = getAppointmentDateTime(item);
  const isDatePast = date ? date.getTime() < Date.now() : false;

  if (status === "cancel_requested" && cancelRequestStatus === "pending") {
    return false;
  }

  return isDatePast || status === "completed" || status === "cancelled";
}

function sortAppointmentsByHistory(items) {
  return sortAppointmentsByDateTime(items, "desc");
}

function mergeAppointmentById(items, incoming) {
  if (!incoming?._id) {
    return sortAppointmentsByHistory(items);
  }

  const exists = items.some((item) => item?._id === incoming._id);
  const nextItems = exists
    ? items.map((item) => (item?._id === incoming._id ? incoming : item))
    : [...items, incoming];

  return sortAppointmentsByHistory(nextItems);
}

export default function ClinicHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedIds, setExpandedIds] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [socketStatus, setSocketStatus] = useState("connecting");

  const fetchAppointments = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setBackgroundRefreshing(true);
    } else {
      setLoading(true);
      setError("");
    }

    try {
      const { data } = await http.get("/api/appointments/clinic");
      setItems(sortAppointmentsByHistory(Array.isArray(data) ? data : []));
      setLastUpdated(new Date());
    } catch (e) {
      if (!silent) {
        setError(
          e?.response?.data?.message ||
            "Geçmiş randevular alınırken bir hata oluştu."
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

    const handleAppointmentCreated = (appointment) => {
      setItems((prev) => mergeAppointmentById(prev, appointment));
      setLastUpdated(new Date());
    };

    const handleAppointmentUpdated = (appointment) => {
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

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("appointment:created", handleAppointmentCreated);
    socket.on("appointment:updated", handleAppointmentUpdated);
    socket.on("appointment:cancel_approved", handleCancelApproved);
    socket.on("appointment:cancel_rejected", handleCancelRejected);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleReconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("appointment:created", handleAppointmentCreated);
      socket.off("appointment:updated", handleAppointmentUpdated);
      socket.off("appointment:cancel_approved", handleCancelApproved);
      socket.off("appointment:cancel_rejected", handleCancelRejected);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleReconnect);
      socket.disconnect();
    };
  }, [fetchAppointments]);

  const historyAppointments = useMemo(() => {
    return sortAppointmentsByHistory(items).filter(isPastAppointment);
  }, [items]);

  const groupedHistoryAppointments = useMemo(() => {
    return Object.values(groupAppointmentsByDate(historyAppointments));
  }, [historyAppointments]);

  useEffect(() => {
    setExpandedIds((prev) =>
      prev.filter((id) => historyAppointments.some((item) => item?._id === id))
    );
  }, [historyAppointments]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <ClinicLayout
      title="Geçmiş Randevular"
      description="Tamamlanan, iptal edilen veya tarihi geçmiş klinik randevularını burada görüntüleyebilirsiniz."
    >
      <div className="clinic-pagehead">
        <div>
          <div className="clinic-badge clinic-badge--soft">Geçmiş Kayıtlar</div>
          <h2 className="clinic-section-title">Geçmiş Randevular</h2>
          <p className="clinic-section-subtitle">
            Sadece geçmişe düşen, tamamlanan veya iptal edilen randevular burada listelenir.
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

      {loading && groupedHistoryAppointments.length === 0 ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>Geçmiş randevular yükleniyor...</h2>
          <p>Kliniğe ait geçmiş randevular backend üzerinden getiriliyor.</p>
        </div>
      ) : error ? (
        <div className="placeholderCard clinic-card clinic-state-card clinic-state-card--error">
          <h2>Bir sorun oluştu</h2>
          <p>{error}</p>
        </div>
      ) : groupedHistoryAppointments.length === 0 ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>Geçmiş randevu bulunmamaktadır.</h2>
          <p>Geçmişe düşen, tamamlanan veya iptal edilen randevular oluştuğunda bu ekranda listelenecektir.</p>
        </div>
      ) : (
        <div className="clinic-appointment-groups">
          {groupedHistoryAppointments.map((group) => (
            <section className="clinic-appointment-group" key={group.key}>
              <div className="clinic-group-header">
                <div className="clinic-group-header__accent" aria-hidden="true" />
                <div className="clinic-group-header__content">
                  <h3 className="clinic-group-header__title">{group.title}</h3>
                  <p className="clinic-group-header__count">
                    {group.items.length} kayıt
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
            const hasStatusUpdatedAt =
              (String(item?.status || "").toLowerCase() === "cancelled" ||
                String(item?.status || "").toLowerCase() === "completed") &&
              item?.updatedAt;

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
                      <span className={`clinic-badge ${historyStatusClass(item)}`}>
                        {historyStatusText(item)}
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
                        <span className="clinic-info__value">{historyStatusText(item)}</span>
                      </div>

                      <div className="clinic-info">
                        <span className="clinic-info__label">OLUŞTURULMA</span>
                        <span className="clinic-info__value">{formatAppointmentDateTime(item?.createdAt)}</span>
                      </div>

                      {hasStatusUpdatedAt ? (
                        <div className="clinic-info">
                          <span className="clinic-info__label">
                            {String(item?.status || "").toLowerCase() === "cancelled"
                              ? "İPTAL EDİLME"
                              : "TAMAMLANMA"}
                          </span>
                          <span className="clinic-info__value">{formatAppointmentDateTime(item?.updatedAt)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="clinic-info clinic-info--full">
                      <span className="clinic-info__label">RANDEVU NOTU</span>
                      <span className="clinic-info__value">
                        {fallback(item?.notes, "Belirtilmemiş")}
                      </span>
                    </div>

                    {item?.cancelReason ? (
                      <div className="clinic-info clinic-info--full">
                        <span className="clinic-info__label">İPTAL SEBEBİ</span>
                        <span className="clinic-info__value">
                          {fallback(item?.cancelReason, "Belirtilmemiş")}
                        </span>
                      </div>
                    ) : null}
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
    </ClinicLayout>
  );
}
