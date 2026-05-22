import { useCallback, useEffect, useMemo, useState } from "react";
import ClinicLayout from "../components/ClinicLayout";
import http from "../api/http";
import { createClinicSocket } from "../api/clinicSocket";
import {
  getEditableSlotTimes,
  getTodayDateKey,
  getVisibleSlotTimes,
  isPastDateKey,
  isPastSlotForDate,
} from "../utils/slotTimes";
import { formatAppointmentDate, formatAppointmentDateTime } from "../utils/appointmentGroups";

function fallback(value, empty = "") {
  return value && String(value).trim() ? value : empty;
}

export default function ClinicSlots() {
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey);
  const [closedTimes, setClosedTimes] = useState(new Set());
  const [persistedClosedTimes, setPersistedClosedTimes] = useState(new Set());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  const visibleSlots = useMemo(() => getVisibleSlotTimes(selectedDate), [selectedDate]);
  const editableSlots = useMemo(
    () => getEditableSlotTimes(selectedDate, currentTimeMs),
    [selectedDate, currentTimeMs]
  );
  const isPastDateSelected = useMemo(
    () => isPastDateKey(selectedDate, getTodayDateKey()),
    [selectedDate]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  const loadSlots = useCallback(async ({ silent = false } = {}) => {
    if (isPastDateKey(selectedDate, getTodayDateKey())) {
      setClosedTimes(new Set());
      setNote("");
      setLoading(false);
      setError("Geçmiş tarihler için slot düzenlemesi yapılamaz.");
      return;
    }

    if (silent) {
      setError("");
    } else {
      setLoading(true);
      setError("");
    }

    try {
      const { data } = await http.get("/api/clinic-slots/closed", {
        params: { date: selectedDate },
      });

      const nextClosedTimes = new Set(Array.isArray(data?.closedTimes) ? data.closedTimes : []);
      setClosedTimes(nextClosedTimes);
      setPersistedClosedTimes(nextClosedTimes);
      setNote(data?.note || "");
      setLastUpdated(new Date());
    } catch (e) {
      if (!silent) {
        setClosedTimes(new Set());
        setPersistedClosedTimes(new Set());
        setNote("");
        setError(
          e?.response?.data?.message ||
            "Kapalı saatler alınırken bir hata oluştu."
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    const socket = createClinicSocket();

    const handleConnect = () => {
      setSocketStatus("connected");
      loadSlots({ silent: true });
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
      loadSlots({ silent: true });
    };

    const handleSlotUpdated = (payload) => {
      if (payload?.date !== selectedDate) return;

      const nextClosedTimes = new Set(Array.isArray(payload?.closedTimes) ? payload.closedTimes : []);
      setClosedTimes(nextClosedTimes);
      setPersistedClosedTimes(nextClosedTimes);
      setNote(payload?.note || "");
      setLastUpdated(new Date());
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("slot:updated", handleSlotUpdated);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleReconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("slot:updated", handleSlotUpdated);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleReconnect);
      socket.disconnect();
    };
  }, [loadSlots, selectedDate]);

  const toggleSlot = (slot) => {
    if (isPastSlotForDate(selectedDate, slot, currentTimeMs)) {
      return;
    }

    setClosedTimes((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) {
        next.delete(slot);
      } else {
        next.add(slot);
      }
      return next;
    });
  };

  const handleOpenAll = () => {
    setClosedTimes((prev) => {
      const next = new Set(prev);
      visibleSlots.forEach((slot) => {
        if (!isPastSlotForDate(selectedDate, slot, currentTimeMs)) {
          next.delete(slot);
        }
      });
      return next;
    });
  };

  const handleCloseAll = () => {
    setClosedTimes((prev) => {
      const next = new Set(prev);
      editableSlots.forEach((slot) => next.add(slot));
      return next;
    });
  };

  const handleDateChange = (value) => {
    if (isPastDateKey(value, getTodayDateKey())) {
      setFeedback({
        type: "error",
        message: "Geçmiş tarihler için slot düzenlemesi yapılamaz.",
      });
      setSelectedDate(getTodayDateKey());
      return;
    }

    setFeedback({ type: "", message: "" });
    setSelectedDate(value);
  };

  const handleSave = async () => {
    if (isPastDateSelected) {
      setFeedback({
        type: "error",
        message: "Geçmiş tarihler için slot düzenlemesi yapılamaz.",
      });
      return;
    }

    setSaving(true);
    setError("");
    setFeedback({ type: "", message: "" });

    try {
      const normalizedNote = fallback(note);
      const sortedClosedTimes = [...closedTimes].sort();
      const requestedPastSlots = sortedClosedTimes
        .filter((slot) => isPastSlotForDate(selectedDate, slot, currentTimeMs))
        .sort();
      const persistedPastSlots = [...persistedClosedTimes]
        .filter((slot) => isPastSlotForDate(selectedDate, slot, currentTimeMs))
        .sort();

      if (JSON.stringify(requestedPastSlots) !== JSON.stringify(persistedPastSlots)) {
        throw new Error("Geçmiş saatler için slot düzenlemesi yapılamaz.");
      }

      if (sortedClosedTimes.length === 0 && !normalizedNote) {
        const { data } = await http.delete("/api/clinic-slots/closed", {
          params: { date: selectedDate },
        });

        setClosedTimes(new Set());
        setPersistedClosedTimes(new Set());
        setNote("");
        setLastUpdated(new Date());
        setFeedback({
          type: "success",
          message: data?.message || "Kapalı saat ayarı temizlendi.",
        });
        return;
      }

      const { data } = await http.post("/api/clinic-slots/closed", {
        date: selectedDate,
        closedTimes: sortedClosedTimes,
        note: normalizedNote,
      });

      const nextClosedTimes = new Set(data?.slot?.closedTimes || []);
      setClosedTimes(nextClosedTimes);
      setPersistedClosedTimes(nextClosedTimes);
      setNote(data?.slot?.note || "");
      setLastUpdated(new Date());
      setFeedback({
        type: "success",
        message: data?.message || "Slot ayarları kaydedildi.",
      });
    } catch (e) {
      const message =
        e?.message === "Geçmiş saatler için slot düzenlemesi yapılamaz."
          ? e.message
          :
        e?.response?.data?.message ||
        "Kapalı saatler kaydedilirken bir hata oluştu.";
      setError(message);
      setFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ClinicLayout
      title="Kapalı Saat / Slot Yönetimi"
      description="Belirli tarihler için online randevuya kapatmak istediğiniz saatleri buradan düzenleyebilirsiniz."
    >
      <div className="clinic-pagehead">
        <div>
          <div className="clinic-badge clinic-badge--soft">Slot Yönetimi</div>
          <h2 className="clinic-section-title">Kapalı Saat / Slot Yönetimi</h2>
          <p className="clinic-section-subtitle">
            Seçtiğiniz gün için online randevuya kapatmak istediğiniz saatleri işaretleyin.
          </p>
        </div>

        <div className="clinic-live-meta">
          <span
            className={`clinic-live-dot clinic-live-dot--${socketStatus} ${
              socketStatus === "reconnecting" ? "is-refreshing" : ""
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

      <div className="clinic-card clinic-slots-card">
        <div className="clinic-slots-toolbar">
          <div className="clinic-slots-date">
            <label className="clinic-slots-label" htmlFor="clinic-slot-date">
              Tarih
            </label>
            <input
              id="clinic-slot-date"
              className="clinic-slots-date-input"
              type="date"
              min={getTodayDateKey()}
              value={selectedDate}
              onChange={(event) => handleDateChange(event.target.value)}
            />
            <p className="clinic-slots-date-text">
              {formatAppointmentDate(new Date(`${selectedDate}T12:00:00+03:00`))}
            </p>
          </div>

          <div className="clinic-slots-toolbar-actions">
            <button
              type="button"
              className="btn clinic-button clinic-button--neutral"
              onClick={handleOpenAll}
              disabled={loading || saving}
            >
              Tümünü Aç
            </button>
            <button
              type="button"
              className="btn clinic-button clinic-button--danger"
              onClick={handleCloseAll}
              disabled={loading || saving || visibleSlots.length === 0}
            >
              Tümünü Kapat
            </button>
          </div>
        </div>

        <div className="clinic-slots-section">
          <div className="clinic-slots-section__header">
            <h3 className="clinic-slots-section__title">Saatler</h3>
            <p className="clinic-slots-section__subtitle">
              Kapalı saatler kırmızı görünür. Açık saatler kullanıcıların randevu almasına uygundur.
            </p>
          </div>

          {loading ? (
            <div className="clinic-state-card clinic-card clinic-state-card--inline">
              <h2>Saatler yükleniyor...</h2>
              <p>Seçilen tarihe ait slot bilgileri getiriliyor.</p>
            </div>
          ) : error && !feedback.message ? (
            <div className="clinic-state-card clinic-card clinic-state-card--error clinic-state-card--inline">
              <h2>Bir sorun oluştu</h2>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {editableSlots.length === 0 ? (
                <div className="clinic-state-card clinic-card clinic-state-card--inline">
                  <h2>Bugün için düzenlenebilir slot kalmamıştır.</h2>
                  <p>Bugünün geçmiş saatleri yalnızca görüntülenir, düzenlenemez.</p>
                </div>
              ) : null}

              <div className="clinic-slot-grid">
              {visibleSlots.map((slot) => {
                const isClosed = closedTimes.has(slot);
                const isPastSlot = isPastSlotForDate(selectedDate, slot, currentTimeMs);

                return (
                  <button
                    type="button"
                    key={slot}
                    className={`clinic-slot-button ${
                      isPastSlot
                        ? "clinic-slot-button--past"
                        : isClosed
                          ? "clinic-slot-button--closed"
                          : "clinic-slot-button--open"
                    }`}
                    onClick={() => toggleSlot(slot)}
                    disabled={saving || isPastSlot}
                  >
                    <span className="clinic-slot-button__time">{slot}</span>
                    <span className="clinic-slot-button__state">
                      {isPastSlot ? "Geçmiş" : isClosed ? "Kapalı" : "Açık"}
                    </span>
                  </button>
                );
              })}
              </div>
            </>
          )}
        </div>

        <div className="clinic-slots-section">
          <div className="clinic-slots-section__header">
            <h3 className="clinic-slots-section__title">Not</h3>
            <p className="clinic-slots-section__subtitle">
              Örneğin: Öğle arası, resmi tatil veya yoğunluk nedeniyle kapalı.
            </p>
          </div>

          <textarea
            className="clinic-slots-note"
            rows="4"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Örn: Öğle arası ve özel durum"
            disabled={saving}
          />
        </div>

        <div className="clinic-slots-footer">
          <p className="clinic-slots-footer__hint">
            Tüm saatler açık bırakılırsa o gün için kapalı slot kaydı temizlenir.
          </p>
          <button
            type="button"
            className="btn clinic-button clinic-button--success"
            onClick={handleSave}
            disabled={loading || saving || isPastDateSelected}
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </ClinicLayout>
  );
}
