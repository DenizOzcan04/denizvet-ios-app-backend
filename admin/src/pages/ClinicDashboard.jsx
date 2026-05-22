import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClinicLayout from "../components/ClinicLayout";
import http from "../api/http";
import { createClinicSocket } from "../api/clinicSocket";
import {
  formatAppointmentDate,
  formatAppointmentDateTime,
  getAppointmentDateTime,
  sortAppointmentsByDateTime,
} from "../utils/appointmentGroups";
import { getTodayDateKey } from "../utils/slotTimes";

function getDateKeyFromMs(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fallback(value, empty = "Belirtilmemiş") {
  return value && String(value).trim() ? value : empty;
}

function statusText(status) {
  const current = String(status || "").toLowerCase();
  if (current === "active") return "Aktif";
  if (current === "completed") return "Tamamlandı";
  if (current === "cancel_requested") return "İptal Talebi";
  if (current === "cancelled") return "İptal Edildi";
  return "Belirtilmemiş";
}

function mergeAppointmentById(items, incoming) {
  if (!incoming?._id) {
    return items;
  }

  const exists = items.some((item) => item?._id === incoming._id);
  return exists
    ? items.map((item) => (item?._id === incoming._id ? incoming : item))
    : [...items, incoming];
}

function isPendingCancelRequest(item) {
  return (
    String(item?.status || "").toLowerCase() === "cancel_requested" &&
    String(item?.cancelRequestStatus || "").toLowerCase() === "pending"
  );
}

function isActiveUpcomingAppointment(item, nowMs) {
  const status = String(item?.status || "").toLowerCase();
  if (status === "cancelled" || status === "cancel_requested" || status === "completed") {
    return false;
  }

  const date = getAppointmentDateTime(item);
  if (!date) return false;

  return date.getTime() >= nowMs;
}

function isHistoryAppointment(item, nowMs) {
  const status = String(item?.status || "").toLowerCase();
  const cancelRequestStatus = String(item?.cancelRequestStatus || "").toLowerCase();
  const date = getAppointmentDateTime(item);
  const isDatePast = date ? date.getTime() < nowMs : false;

  if (status === "cancel_requested" && cancelRequestStatus === "pending") {
    return false;
  }

  return isDatePast || status === "completed" || status === "cancelled";
}

function isTodayAppointment(item, todayKey) {
  const status = String(item?.status || "").toLowerCase();
  return item?.date === todayKey && status !== "cancelled";
}

function infoLine(parts) {
  return parts.filter(Boolean).join(" • ");
}

function fullName(item) {
  const firstName = fallback(item?.user?.name || item?.ownerName, "");
  const lastName = fallback(item?.user?.surname, "");
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return combined || "Belirtilmemiş";
}

export default function ClinicDashboard() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [todaySlotData, setTodaySlotData] = useState({ closedTimes: [], note: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const todayKey = useMemo(() => getDateKeyFromMs(nowMs), [nowMs]);
  const todayLabel = useMemo(() => formatAppointmentDate(new Date(`${todayKey}T12:00:00+03:00`)), [todayKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  const fetchAppointments = useCallback(async () => {
    const { data } = await http.get("/api/appointments/clinic");
    return Array.isArray(data) ? data : [];
  }, []);

  const fetchTodaySlots = useCallback(async (dateKey) => {
    const { data } = await http.get("/api/clinic-slots/closed", {
      params: { date: dateKey },
    });

    return {
      closedTimes: Array.isArray(data?.closedTimes) ? data.closedTimes : [],
      note: data?.note || "",
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [appointmentsData, slotData] = await Promise.all([
        fetchAppointments(),
        fetchTodaySlots(todayKey),
      ]);

      setAppointments(appointmentsData);
      setTodaySlotData(slotData);
      setLastUpdated(new Date());
    } catch (e) {
      setError(
        e?.response?.data?.message ||
          "Klinik dashboard verileri alınırken bir hata oluştu."
      );
    } finally {
      setLoading(false);
    }
  }, [fetchAppointments, fetchTodaySlots, todayKey]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const socket = createClinicSocket();

    const handleConnect = async () => {
      try {
        const [appointmentsData, slotData] = await Promise.all([
          fetchAppointments(),
          fetchTodaySlots(todayKey),
        ]);

        setAppointments(appointmentsData);
        setTodaySlotData(slotData);
        setLastUpdated(new Date());
      } catch {
        // keep existing data during reconnect problems
      }
    };

    const handleAppointmentMutation = (appointment) => {
      setAppointments((prev) => mergeAppointmentById(prev, appointment));
      setLastUpdated(new Date());
    };

    const handleSlotUpdated = (payload) => {
      if (payload?.date !== todayKey) return;

      setTodaySlotData({
        closedTimes: Array.isArray(payload?.closedTimes) ? payload.closedTimes : [],
        note: payload?.note || "",
      });
      setLastUpdated(new Date());
    };

    socket.on("connect", handleConnect);
    socket.on("appointment:created", handleAppointmentMutation);
    socket.on("appointment:updated", handleAppointmentMutation);
    socket.on("appointment:cancel_requested", handleAppointmentMutation);
    socket.on("appointment:cancel_approved", handleAppointmentMutation);
    socket.on("appointment:cancel_rejected", handleAppointmentMutation);
    socket.on("slot:updated", handleSlotUpdated);
    socket.io.on("reconnect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("appointment:created", handleAppointmentMutation);
      socket.off("appointment:updated", handleAppointmentMutation);
      socket.off("appointment:cancel_requested", handleAppointmentMutation);
      socket.off("appointment:cancel_approved", handleAppointmentMutation);
      socket.off("appointment:cancel_rejected", handleAppointmentMutation);
      socket.off("slot:updated", handleSlotUpdated);
      socket.io.off("reconnect", handleConnect);
      socket.disconnect();
    };
  }, [fetchAppointments, fetchTodaySlots, todayKey]);

  const todayAppointments = useMemo(() => {
    return sortAppointmentsByDateTime(
      appointments.filter((item) => isTodayAppointment(item, todayKey)),
      "asc"
    );
  }, [appointments, todayKey]);

  const activeAppointments = useMemo(() => {
    return sortAppointmentsByDateTime(
      appointments.filter((item) => isActiveUpcomingAppointment(item, nowMs)),
      "asc"
    );
  }, [appointments, nowMs]);

  const pendingCancelRequests = useMemo(() => {
    return sortAppointmentsByDateTime(
      appointments.filter(isPendingCancelRequest),
      "asc"
    );
  }, [appointments]);

  const historyAppointments = useMemo(() => {
    return sortAppointmentsByDateTime(
      appointments.filter((item) => isHistoryAppointment(item, nowMs)),
      "desc"
    );
  }, [appointments, nowMs]);

  const stats = useMemo(
    () => [
      {
        label: "Bugünkü Randevular",
        value: todayAppointments.length,
        hint: todayLabel,
      },
      {
        label: "Aktif Randevular",
        value: activeAppointments.length,
        hint: "Bugün ve gelecek",
      },
      {
        label: "Bekleyen İptal Talepleri",
        value: pendingCancelRequests.length,
        hint: "Klinik onayı bekleniyor",
      },
      {
        label: "Geçmiş Randevular",
        value: historyAppointments.length,
        hint: "Tamamlanan ve iptal edilenler",
      },
      {
        label: "Bugün Kapalı Slot",
        value: todaySlotData.closedTimes.length,
        hint: "Online randevuya kapalı",
      },
    ],
    [
      activeAppointments.length,
      historyAppointments.length,
      pendingCancelRequests.length,
      todayAppointments.length,
      todayLabel,
      todaySlotData.closedTimes.length,
    ]
  );

  const todayAppointmentsPreview = todayAppointments.slice(0, 5);
  const pendingRequestsPreview = pendingCancelRequests.slice(0, 5);

  return (
    <ClinicLayout
      title="Klinik Dashboard"
      description="Bugünkü yoğunluğu, bekleyen talepleri ve slot özetini tek ekranda takip edin."
    >
      <div className="clinic-pagehead">
        <div>
          <h2 className="clinic-section-title">Klinik Dashboard</h2>
          <p className="clinic-section-subtitle">
            Bugünkü randevu akışını, iptal taleplerini ve slot durumunu buradan özet olarak görebilirsiniz.
          </p>
        </div>

        <div className="clinic-live-meta">
          <span className="clinic-live-dot" />
          <span className="clinic-live-meta__text clinic-live-meta__text--single">
            {lastUpdated
              ? `Son senkron: ${formatAppointmentDateTime(lastUpdated)}`
              : "Son senkron hazırlanıyor"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>Dashboard yükleniyor...</h2>
          <p>Klinik özet verileri backend üzerinden getiriliyor.</p>
        </div>
      ) : error ? (
        <div className="placeholderCard clinic-card clinic-state-card clinic-state-card--error">
          <h2>Bir sorun oluştu</h2>
          <p>{error}</p>
        </div>
      ) : (
        <div className="clinic-dashboard">
          <section className="clinic-dashboard-stats">
            {stats.map((item) => (
              <article className="clinic-card clinic-dashboard-stat" key={item.label}>
                <div className="clinic-dashboard-stat__label">{item.label}</div>
                <div className="clinic-dashboard-stat__value">{item.value}</div>
                <div className="clinic-dashboard-stat__hint">{item.hint}</div>
              </article>
            ))}
          </section>

          <section className="clinic-dashboard-grid">
            <article className="clinic-card clinic-dashboard-panel">
              <div className="clinic-dashboard-panel__head">
                <div>
                  <h3 className="clinic-dashboard-panel__title">Bugünkü Randevular</h3>
                  <p className="clinic-dashboard-panel__subtitle">
                    {todayLabel} için en yakın 5 randevu listelenir.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn clinic-button clinic-button--teal"
                  onClick={() => navigate("/clinic/appointments")}
                >
                  Tüm Aktif Randevuları Gör
                </button>
              </div>

              {todayAppointmentsPreview.length === 0 ? (
                <div className="clinic-dashboard-empty">Bugün için randevu bulunmamaktadır.</div>
              ) : (
                <div className="clinic-dashboard-list">
                  {todayAppointmentsPreview.map((item) => (
                    <div className="clinic-dashboard-item" key={item._id}>
                      <div className="clinic-dashboard-item__time">{fallback(item?.time)}</div>
                      <div className="clinic-dashboard-item__body">
                        <div className="clinic-dashboard-item__title">
                          {fullName(item)}
                        </div>
                        <div className="clinic-dashboard-item__meta">
                          {infoLine([
                            fallback(item?.petName, ""),
                            fallback(item?.petType, ""),
                            fallback(item?.serviceType, ""),
                          ]) || "Belirtilmemiş"}
                        </div>
                      </div>
                      <div className="clinic-badge clinic-badge--soft">{statusText(item?.status)}</div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="clinic-card clinic-dashboard-panel">
              <div className="clinic-dashboard-panel__head">
                <div>
                  <h3 className="clinic-dashboard-panel__title">Bekleyen İptal Talepleri</h3>
                  <p className="clinic-dashboard-panel__subtitle">
                    Klinik onayı bekleyen son 5 iptal talebi.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn clinic-button clinic-button--teal"
                  onClick={() => navigate("/clinic/cancel-requests")}
                >
                  İptal Taleplerine Git
                </button>
              </div>

              {pendingRequestsPreview.length === 0 ? (
                <div className="clinic-dashboard-empty">Bekleyen iptal talebi bulunmamaktadır.</div>
              ) : (
                <div className="clinic-dashboard-list">
                  {pendingRequestsPreview.map((item) => (
                    <div className="clinic-dashboard-item clinic-dashboard-item--stacked" key={item._id}>
                      <div className="clinic-dashboard-item__body">
                        <div className="clinic-dashboard-item__title">
                          {fullName(item)}
                        </div>
                        <div className="clinic-dashboard-item__meta">
                          {infoLine([
                            formatAppointmentDate(getAppointmentDateTime(item)),
                            fallback(item?.time, ""),
                          ])}
                        </div>
                        <div className="clinic-dashboard-item__submeta">
                          {fallback(item?.cancelReason, "İptal sebebi belirtilmemiş.")}
                        </div>
                      </div>
                      <div className="clinic-badge clinic-badge--danger-soft">İptal Talebi</div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="clinic-card clinic-dashboard-panel clinic-dashboard-panel--wide">
              <div className="clinic-dashboard-panel__head">
                <div>
                  <h3 className="clinic-dashboard-panel__title">Bugünkü Slot Özeti</h3>
                  <p className="clinic-dashboard-panel__subtitle">
                    {todayLabel} için online randevuya kapalı saatlerin özeti.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn clinic-button clinic-button--teal"
                  onClick={() => navigate("/clinic/slots")}
                >
                  Slot Yönetimine Git
                </button>
              </div>

              {todaySlotData.closedTimes.length > 0 ? (
                <div className="clinic-dashboard-slot-summary">
                  <div className="clinic-dashboard-slot-summary__title">Bugün kapalı saatler</div>
                  <div className="clinic-dashboard-slot-tags">
                    {todaySlotData.closedTimes.map((slot) => (
                      <span className="clinic-dashboard-slot-tag" key={slot}>
                        {slot}
                      </span>
                    ))}
                  </div>
                  {todaySlotData.note ? (
                    <p className="clinic-dashboard-slot-summary__note">
                      Not: {todaySlotData.note}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="clinic-dashboard-empty">
                  Bugün tüm online randevu saatleri açık görünüyor.
                </div>
              )}
            </article>
          </section>
        </div>
      )}
    </ClinicLayout>
  );
}
