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

function isToday(date) {
  if (!date) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function statusText(status) {
  const current = String(status || "").toLowerCase();
  if (current === "active") return "Aktif";
  if (current === "completed") return "Tamamlandı";
  if (current === "cancel_requested") return "İptal Talebi";
  if (current === "cancelled") return "İptal";
  return "Belirtilmemiş";
}

function fallback(value, empty = "Belirtilmemiş") {
  return value && String(value).trim() ? value : empty;
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

function isActiveUpcomingAppointment(item) {
  const status = String(item?.status || "").toLowerCase();
  if (status === "cancelled" || status === "cancel_requested" || status === "completed") {
    return false;
  }

  const date = getAppointmentDateTime(item);
  if (!date) return false;

  return date.getTime() >= Date.now();
}

export default function ClinicAppointments() {
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
      setItems(sortAppointmentsByDate(Array.isArray(data) ? data : []));
      setLastUpdated(new Date());
    } catch (e) {
      if (!silent) {
        setError(
          e?.response?.data?.message ||
            "Aktif randevular alınırken bir hata oluştu."
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
      console.log("appointment:created", appointment);
      setItems((prev) => mergeAppointmentById(prev, appointment));
      setLastUpdated(new Date());
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("appointment:created", handleAppointmentCreated);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleReconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("appointment:created", handleAppointmentCreated);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleReconnect);
      socket.disconnect();
    };
  }, [fetchAppointments]);

  const activeAppointments = useMemo(() => {
    return sortAppointmentsByDate(items).filter(isActiveUpcomingAppointment);
  }, [items]);

  const groupedAppointments = useMemo(() => {
    return Object.values(groupAppointmentsByDate(activeAppointments));
  }, [activeAppointments]);

  useEffect(() => {
    setExpandedIds((prev) =>
      prev.filter((id) => activeAppointments.some((item) => item?._id === id))
    );
  }, [activeAppointments]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <ClinicLayout
      title="Aktif Randevular"
      description="Kliniğe ait bugünkü ve yaklaşan aktif randevular burada listelenir."
    >
      <div className="clinic-pagehead">
        <div>
          <div className="clinic-badge clinic-badge--soft">Canlı Liste</div>
          <h2 className="clinic-section-title">Aktif Randevular</h2>
          <p className="clinic-section-subtitle">
            Sadece iptal edilmemiş, geçmişte kalmamış ve aktif durumdaki randevular gösterilir.
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

      {loading && groupedAppointments.length === 0 ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>Randevular yükleniyor...</h2>
          <p>Kliniğe ait aktif randevular backend üzerinden getiriliyor.</p>
        </div>
      ) : error ? (
        <div className="placeholderCard clinic-card clinic-state-card clinic-state-card--error">
          <h2>Bir sorun oluştu</h2>
          <p>{error}</p>
        </div>
      ) : groupedAppointments.length === 0 ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>Aktif randevu bulunmamaktadır.</h2>
          <p>Bugün ve ileri tarihli aktif randevu olmadığında bu alan boş görünür.</p>
        </div>
      ) : (
        <div className="clinic-appointment-groups">
          {groupedAppointments.map((group) => (
            <section className="clinic-appointment-group" key={group.key}>
              <div className="clinic-group-header">
                <div className="clinic-group-header__accent" aria-hidden="true" />
                <div className="clinic-group-header__content">
                  <h3 className="clinic-group-header__title">{group.title}</h3>
                  <p className="clinic-group-header__count">
                    {group.items.length} randevu
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
                      {isToday(apptDate) && (
                        <span className="clinic-badge clinic-badge--today">Bugün</span>
                      )}
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
                        <span className="clinic-info__value">
                          {fallback(item?.serviceType)}
                        </span>
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
                        <span className="clinic-info__label">OLUŞTURULMA</span>
                        <span className="clinic-info__value">{formatAppointmentDateTime(item?.createdAt)}</span>
                      </div>
                    </div>

                    <div className="clinic-info clinic-info--full">
                      <span className="clinic-info__label">RANDEVU NOTU</span>
                      <span className="clinic-info__value">
                        {fallback(item?.notes, "Belirtilmemiş")}
                      </span>
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
    </ClinicLayout>
  );
}
