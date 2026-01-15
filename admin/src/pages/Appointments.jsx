import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import http from "../api/http";

function statusText(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "Onaylandı";
  if (s === "completed") return "Tamamlandı";
  if (s === "cancelled") return "İptal Edildi";
  return "—";
}

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "badge badge--ok";
  if (s === "completed") return "badge badge--info";
  if (s === "cancelled") return "badge badge--danger";
  return "badge";
}

function formatClinicName(a) {
  if (a?.clinic?.name) return a.clinic.name;
  if (typeof a?.clinic === "string") return a.clinic;
  return "—";
}

export default function Appointments() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [deletingId, setDeletingId] = useState("");

  const fetchAll = async () => {
    setErr("");
    setLoading(true);
    try {
      const { data } = await http.get("/api/appointments"); // admin list
      setItems(Array.isArray(data) ? data : data.appointments || []);
    } catch (e) {
      setErr(e?.response?.data?.message || "Randevular çekilemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const count = useMemo(() => items.length, [items]);

  const onDelete = async (id) => {
    const ok = window.confirm("Bu randevuyu silmek istediğine emin misin?");
    if (!ok) return;

    setErr("");
    setDeletingId(id);

    const prev = items;
    setItems((p) => p.filter((x) => x._id !== id));

    try {
      await http.delete(`/api/appointments/admin/${id}`);
    } catch (e) {
      setItems(prev);
      setErr(e?.response?.data?.message || "Silme işlemi başarısız.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <Layout>
      <div className="appointmentsPage">
      <div className="pageHead">
        <div>
          <h2 className="pageTitle">Randevular</h2>
          <p className="pageSub">
            Sistemdeki tüm randevuları görüntüleyebilir ve silebilirsin. Toplam:{" "}
            <b>{count}</b>
          </p>
        </div>

        <button className="btn btn--ghost" onClick={fetchAll} disabled={loading}>
          {loading ? "Yenileniyor..." : "Yenile"}
        </button>
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <div className="panel">
        <div className="panel__head">
          <div className="gridHead">
            <div>Pet</div>
            <div>Klinik</div>
            <div>Tarih</div>
            <div>Saat</div>
            <div>Durum</div>
            <div className="right">İşlem</div>
          </div>
        </div>

        {/* Tablo body */}
        <div className="panel__body">
          {loading ? (
            <div className="empty">Randevular yükleniyor...</div>
          ) : items.length === 0 ? (
            <div className="empty">Henüz randevu yok.</div>
          ) : (
            items.map((a) => {
              const isDeleting = deletingId === a._id;

              return (
                <div
                  key={a._id}
                  className={`gridRow ${isDeleting ? "row--disabled" : ""}`}
                >
                  <div className="cell">
                    <div className="cellMain">{a.petName || "—"}</div>
                    <div className="cellSub">{a.petType || ""}</div>
                  </div>

                  <div className="cell">
                    <div className="cellMain">{formatClinicName(a)}</div>
                    <div className="cellSub">
                      {a?.clinic?.address ? a.clinic.address : ""}
                    </div>
                  </div>

                  <div className="cell">
                    <div className="cellMain mono">{a.date || "—"}</div>
                  </div>

                  <div className="cell">
                    <div className="cellMain mono">{a.time || "—"}</div>
                  </div>

                  <div className="cell">
                    <span className={statusBadgeClass(a.status)}>
                      {statusText(a.status)}
                    </span>
                  </div>

                  <div className="cell right">
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => onDelete(a._id)}
                      disabled={isDeleting}
                      title="Randevuyu sil"
                    >
                      {isDeleting ? "Siliniyor..." : "Sil"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </div>
    </Layout>
  );
}
