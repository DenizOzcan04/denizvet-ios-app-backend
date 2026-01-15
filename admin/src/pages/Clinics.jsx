import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import http from "../api/http";

export default function Clinics() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [active, setActive] = useState(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const fetchClinics = async () => {
    setErr("");
    setLoading(true);
    try {
      const { data } = await http.get("/api/clinics");
      const arr = Array.isArray(data) ? data : data.clinics || [];
      arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setItems(arr);
    } catch (e) {
      setErr(e?.response?.data?.message || "Klinikler çekilemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClinics();
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const openCreate = () => {
    setMode("create");
    setActive(null);
    setName("");
    setAddress("");
    setCity("");
    setPhone("");
    setDescription("");
    setModalOpen(true);
    document.body.style.overflow = "hidden";
  };

  const openEdit = (c) => {
    setMode("edit");
    setActive(c);
    setName(c.name || "");
    setAddress(c.address || "");
    setCity(c.city || "");
    setPhone(c.phone || "");
    setDescription(c.description || "");
    setModalOpen(true);
    document.body.style.overflow = "hidden";
  };

  const closeModal = () => {
    setModalOpen(false);
    setActive(null);
    setMode("create");
    document.body.style.overflow = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!name.trim()) {
      setErr("Klinik adı zorunludur.");
      return;
    }

    const payload = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      phone: phone.trim(),
      description: description.trim(),
    };

    try {
      if (mode === "create") {
        await http.post("/api/clinics", payload);
      } else {
        await http.put(`/api/clinics/${active?._id}`, payload);
      }
      closeModal();
      await fetchClinics();
    } catch (e2) {
      setErr(e2?.response?.data?.message || "İşlem başarısız.");
    }
  };

  const remove = async (c) => {
    const ok = window.confirm(`"${c.name}" kliniğini silmek istiyor musun?`);
    if (!ok) return;

    setErr("");
    try {
      await http.delete(`/api/clinics/${c._id}`);
      await fetchClinics();
    } catch (e) {
      setErr(e?.response?.data?.message || "Silme işlemi başarısız.");
    }
  };

  return (
    <Layout>
      <div className="resourcePage clinicsPage">
        <div className="pageHead">
          <div>
            <h2 className="pageTitle">Klinikler</h2>
            <p className="pageSub">Klinikleri yönet: ekle, düzenle, sil.</p>
          </div>

          <div className="pageActions">
            <div className="searchBox">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kliniklerde ara..."
              />
            </div>

            <button className="btn primary" onClick={openCreate}>
              + Yeni Klinik
            </button>
          </div>
        </div>

        {err && <div className="error">{err}</div>}

        <div className="resourceWrap">
          <div className="resourceToolbar">
            <div className="resourceCount">
              Klinik sayısı: <b>{filtered.length}</b>
            </div>

            <button className="btn soft" onClick={fetchClinics} disabled={loading}>
              {loading ? "Yenileniyor..." : "Yenile"}
            </button>
          </div>

          {loading ? (
            <div className="resourceEmpty">
              <div className="skeletonTitle" />
              <div className="skeletonLine" />
              <div className="skeletonLine" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="resourceEmpty">
              <div className="emptyTitle">Henüz klinik yok</div>
              <div className="emptyText">İlk kliniği eklemek için “Yeni Klinik”e tıkla.</div>
              <button className="btn primary" onClick={openCreate}>
                + Yeni Klinik
              </button>
            </div>
          ) : (
            <div className="resourceList">
              {filtered.map((c) => (
                <div className="resourceCard" key={c._id}>
                  <div className="resourceCard__content">
                    <div className="resourceCard__title">{c.name || "—"}</div>

                    <div className="resourceCard__preview">
                      <span className="muted">{c.address || "Adres yok"}</span>
                      {c.city ? <span className="muted"> • {c.city}</span> : null}
                      {c.phone ? <span className="muted"> • {c.phone}</span> : null}
                    </div>

                    {c.description ? <div className="resourceHint">{c.description}</div> : null}
                  </div>

                  <div className="resourceCard__actions">
                    <button className="btn" onClick={() => openEdit(c)}>
                      Düzenle
                    </button>
                    <button className="btn danger" onClick={() => remove(c)}>
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="modalOverlay--fixed" onMouseDown={closeModal}>
            <div className="modalCard--resource modalAnim" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead--resource">
                <div>
                  <div className="modalTitle--resource">
                    {mode === "create" ? "Yeni Klinik" : "Klinik Düzenle"}
                  </div>
                  <div className="modalSub--resource">
                    {mode === "create"
                      ? "Yeni bir klinik oluştur."
                      : "Klinik bilgilerini güncelle ve kaydet."}
                  </div>
                </div>

                <button className="modalClose--resource" onClick={closeModal} type="button">
                  ✕
                </button>
              </div>

              <form onSubmit={submit} className="modalBody--resource">
                <div className="fieldGroup">
                  <label className="fieldLabel">Klinik Adı</label>
                  <input
                    className="fieldInput"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn: Merkez Kliniği"
                    autoFocus
                  />
                </div>

                <div className="fieldGroup">
                  <label className="fieldLabel">Adres</label>
                  <input
                    className="fieldInput"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Örn: Avcılar"
                  />
                </div>

                <div className="fieldGroup">
                  <label className="fieldLabel">Şehir</label>
                  <input
                    className="fieldInput"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Örn: İstanbul"
                  />
                </div>

                <div className="fieldGroup">
                  <label className="fieldLabel">Telefon</label>
                  <input
                    className="fieldInput"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Örn: 0555..."
                  />
                </div>

                <div className="fieldGroup">
                  <label className="fieldLabel">Açıklama</label>
                  <textarea
                    className="editorLarge"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Kısa açıklama..."
                  />
                </div>

                <div className="modalFoot--resource">
                  <button className="btn primary" type="submit">
                    {mode === "create" ? "Kaydet" : "Güncelle"}
                  </button>

                  <button type="button" className="btn soft" onClick={closeModal}>
                    Vazgeç
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
