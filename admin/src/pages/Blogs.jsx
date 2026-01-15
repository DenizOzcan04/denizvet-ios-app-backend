import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import http from "../api/http";

function previewText(str, max = 520) {
  const s = (str || "").replace(/\s+/g, " ").trim();
  if (!s) return "İçerik yok.";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function Blogs() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [active, setActive] = useState(null);

  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [content, setContent] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((b) => {
      return (
        (b.title || "").toLowerCase().includes(q) ||
        (b.content || "").toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const fetchBlogs = async () => {
    setErr("");
    setLoading(true);
    try {
      const { data } = await http.get("/api/blogs");
      const arr = Array.isArray(data) ? data : data.blogs || [];
      arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setItems(arr);
    } catch (e) {
      setErr(e?.response?.data?.message || "Bloglar çekilemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlogs();
  }, []);

  const openCreate = () => {
    setMode("create");
    setActive(null);
    setTitle("");
    setImageUrl("");
    setContent("");
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setMode("edit");
    setActive(b);
    setTitle(b.title || "");
    setImageUrl(b.imageUrl || "");
    setContent(b.content || "");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActive(null);
    setTitle("");
    setImageUrl("");
    setContent("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!title.trim() || !content.trim()) {
      setErr("Başlık ve içerik zorunludur.");
      return;
    }

    const payload = {
      title: title.trim(),
      content: content.trim(),
      imageUrl: imageUrl.trim(),
    };

    try {
      if (mode === "create") {
        await http.post("/api/blogs", payload);
      } else {
        await http.put(`/api/blogs/${active._id}`, payload);
      }
      closeModal();
      await fetchBlogs();
    } catch (e2) {
      setErr(e2?.response?.data?.message || "İşlem başarısız.");
    }
  };

  const remove = async (b) => {
    const ok = window.confirm(`"${b.title}" blogunu silmek istiyor musun?`);
    if (!ok) return;

    setErr("");
    try {
      await http.delete(`/api/blogs/${b._id}`);
      await fetchBlogs();
    } catch (e) {
      setErr(e?.response?.data?.message || "Silme işlemi başarısız.");
    }
  };

  return (
    <Layout>
      <div className="blogsPage">
        <div className="pageHead">
          <div>
            <h2 className="pageTitle">Bloglar</h2>
            <p className="pageSub">Blog içeriklerini yönet: ekle, düzenle, sil.</p>
          </div>

          <div className="pageActions">
            <div className="searchBox">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Bloglarda ara..."
              />
            </div>

            <button className="btn btnPrimary" onClick={openCreate}>
              + Yeni Blog
            </button>
          </div>
        </div>

        {err && <div className="error">{err}</div>}

        <div className="blogsWrap">
          <div className="blogsToolbar">
            <div className="blogsCount">
              Blog sayısı: <b>{filtered.length}</b>
            </div>

            <button className="btn btnSoft" onClick={fetchBlogs} disabled={loading}>
              {loading ? "Yenileniyor..." : "Yenile"}
            </button>
          </div>

          {loading ? (
            <div className="blogsEmpty">
              <div className="skeletonTitle" />
              <div className="skeletonLine" />
              <div className="skeletonLine" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="blogsEmpty">
              <div className="emptyTitle">Henüz blog yok</div>
              <div className="emptyText">İlk blogunu eklemek için “Yeni Blog”a tıkla.</div>
              <button className="btn btnPrimary" onClick={openCreate}>
                + Yeni Blog
              </button>
            </div>
          ) : (
            <div className="blogList">
              {filtered.map((b) => (
                <div className="blogCard" key={b._id}>
                  <div className="blogCard__content">
                    <div className="blogCard__title">{b.title}</div>
                    <div className="blogCard__preview">{previewText(b.content)}</div>
                    {b.imageUrl ? (
                      <div className="blogCard__imgHint">
                        Görsel: <span className="muted">{b.imageUrl}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="blogCard__actions">
                    <button className="btn btnSoft" onClick={() => openEdit(b)}>
                      Düzenle
                    </button>
                    <button className="btn danger" onClick={() => remove(b)}>
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
            <div
              className="modalCard--blog modalAnim"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="modalHead--blog">
                <div>
                  <div className="modalTitle--blog">
                    {mode === "create" ? "Yeni Blog" : "Blog Düzenle"}
                  </div>
                  <div className="modalSub--blog">
                    {mode === "create"
                      ? "Yeni bir blog içeriği oluştur."
                      : "Blog içeriğini güncelle ve kaydet."}
                  </div>
                </div>

                <button className="modalClose--blog" onClick={closeModal} type="button">
                  ✕
                </button>
              </div>

              <form onSubmit={submit} className="modalBody--blog">
                <div className="fieldGroup">
                  <label className="fieldLabel">Başlık</label>
                  <input
                    className="fieldInput"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Blog başlığı"
                  />
                </div>

                <div className="fieldGroup">
                  <label className="fieldLabel">Görsel URL</label>
                  <input
                    className="fieldInput"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://... (opsiyonel)"
                  />
                </div>

                <div className="fieldGroup">
                  <label className="fieldLabel">İçerik</label>
                  <textarea
                    className="blogEditor--compact"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Blog içeriğini buraya yaz..."
                  />
                </div>

                <div className="modalFoot--blog">
                  <button className="btn btnPrimary" type="submit">
                    {mode === "create" ? "Kaydet" : "Güncelle"}
                  </button>

                  <button type="button" className="btn" onClick={closeModal}>
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
