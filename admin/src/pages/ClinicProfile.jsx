import { useCallback, useEffect, useMemo, useState } from "react";
import ClinicLayout from "../components/ClinicLayout";
import { createClinicSocket } from "../api/clinicSocket";
import { getMyClinic, updateMyClinic } from "../api/clinicProfile";
import { formatAppointmentDateTime } from "../utils/appointmentGroups";

function emptyForm() {
  return {
    address: "",
    phone: "",
    description: "",
  };
}

function sanitizeIncomingClinic(clinic) {
  return {
    ...clinic,
    address: clinic?.address || "",
    phone: clinic?.phone || "",
    description: clinic?.description || "",
  };
}

function extractMessage(error, fallbackMessage) {
  return error?.response?.data?.message || fallbackMessage;
}

export default function ClinicProfile() {
  const [clinic, setClinic] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const loadClinic = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    setError("");

    try {
      const data = await getMyClinic();
      const normalizedClinic = sanitizeIncomingClinic(data);

      setClinic(normalizedClinic);
      setForm({
        address: normalizedClinic.address,
        phone: normalizedClinic.phone,
        description: normalizedClinic.description,
      });
      setLastUpdated(new Date());
    } catch (e) {
      setError(extractMessage(e, "Klinik bilgileri alınırken bir hata oluştu."));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadClinic();
  }, [loadClinic]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeout = window.setTimeout(() => {
      setToast("");
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const socket = createClinicSocket();

    const handleClinicUpdated = (payload) => {
      const nextClinic = sanitizeIncomingClinic(payload?.clinic || {});

      if (!nextClinic?._id) {
        return;
      }

      setClinic(nextClinic);
      setForm({
        address: nextClinic.address,
        phone: nextClinic.phone,
        description: nextClinic.description,
      });
      setLastUpdated(new Date());
    };

    socket.on("clinic:updated", handleClinicUpdated);

    return () => {
      socket.off("clinic:updated", handleClinicUpdated);
      socket.disconnect();
    };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!clinic || saving || !isDirty) {
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setSaving(true);
    setError("");

    try {
      const response = await updateMyClinic(form);
      const updatedClinic = sanitizeIncomingClinic(response?.clinic || {});

      setClinic(updatedClinic);
      setForm({
        address: updatedClinic.address,
        phone: updatedClinic.phone,
        description: updatedClinic.description,
      });
      setToast(response?.message || "Klinik bilgileri güncellendi.");
      setLastUpdated(new Date());
      setShowConfirmModal(false);
    } catch (e) {
      setError(extractMessage(e, "Klinik bilgileri güncellenirken bir hata oluştu."));
    } finally {
      setSaving(false);
    }
  };

  const isDirty = useMemo(() => {
    if (!clinic) return false;

    return (
      String(form.address).trim() !== String(clinic.address || "").trim() ||
      String(form.phone).trim() !== String(clinic.phone || "").trim() ||
      String(form.description).trim() !== String(clinic.description || "").trim()
    );
  }, [clinic, form]);

  return (
    <ClinicLayout
      title="Klinik Bilgilerim"
      description="Klinik iletişim ve açıklama bilgilerinizi buradan güncel tutabilirsiniz."
    >
      <div className="clinic-pagehead">
        <div>
          <h2 className="clinic-section-title">Klinik Bilgilerim</h2>
          <p className="clinic-section-subtitle">
            Adres, telefon ve açıklama bilgilerinizi düzenleyerek kullanıcıların güncel kliniğe ulaşmasını sağlayın.
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

      {toast ? <div className="clinic-toast clinic-toast--success">{toast}</div> : null}

      {loading ? (
        <div className="placeholderCard clinic-card clinic-state-card">
          <h2>Klinik bilgileri yükleniyor...</h2>
          <p>Mevcut adres, telefon ve açıklama bilgileri getiriliyor.</p>
        </div>
      ) : error && !clinic ? (
        <div className="placeholderCard clinic-card clinic-state-card clinic-state-card--error">
          <h2>Bir sorun oluştu</h2>
          <p>{error}</p>
        </div>
      ) : (
        <div className="clinic-profile-grid">
          <section className="clinic-card clinic-profile-summary">
            <div className="clinic-badge clinic-badge--soft">Klinik Özeti</div>
            <h3 className="clinic-profile-summary__title">{clinic?.name || "Klinik"}</h3>
            <div className="clinic-profile-summary__meta">
              <div>
                <span className="clinic-profile-summary__label">Şehir</span>
                <strong>{clinic?.city || "Belirtilmemiş"}</strong>
              </div>
              <div>
                <span className="clinic-profile-summary__label">Durum</span>
                <strong>{clinic?.isActive ? "Aktif" : "Pasif"}</strong>
              </div>
            </div>
          </section>

          <form className="clinic-card clinic-profile-form" onSubmit={handleSubmit}>
            <div className="clinic-profile-form__head">
              <div>
                <h3 className="clinic-profile-form__title">İletişim ve Açıklama</h3>
                <p className="clinic-profile-form__subtitle">
                  Kullanıcıya gösterilen adres, telefon ve açıklama bilgilerinizi güncelleyin.
                </p>
              </div>
            </div>

            {error ? <div className="clinic-inline-error">{error}</div> : null}

            <label className="clinic-field">
              <span className="clinic-field__label">Adres</span>
              <input
                className="clinic-field__input"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Klinik adresinizi girin"
                autoComplete="street-address"
              />
            </label>

            <label className="clinic-field">
              <span className="clinic-field__label">Telefon</span>
              <input
                className="clinic-field__input"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Örn: 0212 555 00 34"
                autoComplete="tel"
              />
            </label>

            <label className="clinic-field">
              <span className="clinic-field__label">Açıklama</span>
              <textarea
                className="clinic-field__textarea"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Kliniğiniz hakkında kısa bir açıklama yazın"
                rows={6}
              />
            </label>

            <div className="clinic-profile-form__actions">
              <button
                type="submit"
                className="btn clinic-button clinic-button--teal"
                disabled={saving || !isDirty}
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showConfirmModal ? (
        <div className="clinic-modal-backdrop">
          <div className="clinic-card clinic-modal">
            <div className="clinic-modal__badge">Onay</div>
            <h3 className="clinic-modal__title">Klinik bilgileri güncellensin mi?</h3>
            <p className="clinic-modal__text">
              Adres, telefon ve açıklama bilgileriniz kullanıcılar tarafından görüntülenecektir. Değişiklikleri kaydetmek istediğinize emin misiniz?
            </p>

            {error ? <p className="clinic-modal__error">{error}</p> : null}

            <div className="clinic-modal__actions">
              <button
                type="button"
                className="btn clinic-button clinic-button--ghost"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="btn clinic-button clinic-button--teal"
                onClick={handleConfirmSubmit}
                disabled={saving}
              >
                {saving ? "Kaydediliyor..." : "Evet, Kaydet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ClinicLayout>
  );
}
