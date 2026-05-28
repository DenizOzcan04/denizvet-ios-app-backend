import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import {
  createProduct,
  getAdminProducts,
  updateProduct,
  updateProductStatus,
} from "../api/products";

const DEFAULT_FORM = {
  name: "",
  description: "",
  price: "",
  imageUrl: "",
  category: "Mama",
  animalType: "general",
  stock: "",
  isActive: true,
  featured: false,
};

const CATEGORY_OPTIONS = ["Mama", "Oyuncak", "Bakım", "Aksesuar", "Sağlık", "Diğer"];

const ANIMAL_TYPE_OPTIONS = [
  { value: "general", label: "Genel" },
  { value: "cat", label: "Kedi" },
  { value: "dog", label: "Köpek" },
  { value: "bird", label: "Kuş" },
  { value: "fish", label: "Balık" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Yeni eklenenler" },
  { value: "price_asc", label: "Fiyat artan" },
  { value: "price_desc", label: "Fiyat azalan" },
  { value: "default", label: "Varsayılan" },
];

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildFormState(product) {
  return {
    name: product?.name || "",
    description: product?.description || "",
    price:
      product?.price === 0 || product?.price ? String(product.price).replace(".", ",") : "",
    imageUrl: product?.imageUrl || "",
    category: product?.category || "Mama",
    animalType: product?.animalType || "general",
    stock: product?.stock === 0 || product?.stock ? String(product.stock) : "",
    isActive: product?.isActive ?? true,
    featured: product?.featured ?? false,
  };
}

function normalizeNumberInput(value) {
  return Number(String(value || "").trim().replace(",", "."));
}

function validateForm(form) {
  const name = form.name.trim();
  const description = form.description.trim();
  const category = form.category.trim();
  const price = normalizeNumberInput(form.price);
  const stock = Number(String(form.stock || "").trim());

  if (!name) return "Ürün adı zorunludur.";
  if (!description) return "Açıklama zorunludur.";
  if (!category) return "Kategori zorunludur.";
  if (!Number.isFinite(price) || price < 0) {
    return "Fiyat geçerli bir sayı olmalı ve 0'dan küçük olamaz.";
  }
  if (!Number.isInteger(stock) || stock < 0) {
    return "Stok geçerli bir tam sayı olmalı ve 0'dan küçük olamaz.";
  }
  if (!ANIMAL_TYPE_OPTIONS.some((item) => item.value === form.animalType)) {
    return "Geçersiz hayvan türü seçildi.";
  }

  return "";
}

function buildPayload(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: normalizeNumberInput(form.price),
    imageUrl: form.imageUrl.trim(),
    category: form.category.trim(),
    animalType: form.animalType,
    stock: Number(String(form.stock || "").trim()),
    isActive: Boolean(form.isActive),
    featured: Boolean(form.featured),
  };
}

function ProductImage({ src, alt }) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div className="productThumbPlaceholder" aria-hidden="true">
        🐾
      </div>
    );
  }

  return (
    <img
      className="productThumb"
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      loading="lazy"
    />
  );
}

export default function Products() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [animalType, setAnimalType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("newest");

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [activeProduct, setActiveProduct] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState("");

  const availableCategories = useMemo(() => {
    const dynamicCategories = items
      .map((item) => String(item.category || "").trim())
      .filter(Boolean);
    return Array.from(new Set([...CATEGORY_OPTIONS, ...dynamicCategories]));
  }, [items]);

  const fetchProducts = async () => {
    setError("");
    setLoading(true);

    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (category.trim()) params.category = category.trim();
      if (animalType.trim()) params.animalType = animalType.trim();
      if (statusFilter.trim()) params.isActive = statusFilter.trim();
      if (sort.trim()) params.sort = sort.trim();

      const { data } = await getAdminProducts(params);
      const list = Array.isArray(data) ? data : [];
      setItems(list);
    } catch (e) {
      setError(e?.response?.data?.message || "Ürünler yüklenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [search, category, animalType, statusFilter, sort]);

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving) {
        closeModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [modalOpen, saving]);

  const openCreate = () => {
    setMode("create");
    setActiveProduct(null);
    setForm(DEFAULT_FORM);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setMode("edit");
    setActiveProduct(product);
    setForm(buildFormState(product));
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveProduct(null);
    setSaving(false);
    setForm(DEFAULT_FORM);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = buildPayload(form);
      if (mode === "create") {
        const { data } = await createProduct(payload);
        setToast(data?.message || "Ürün oluşturuldu.");
      } else {
        const { data } = await updateProduct(activeProduct?._id, payload);
        setToast(data?.message || "Ürün güncellendi.");
      }

      closeModal();
      await fetchProducts();
    } catch (e) {
      setError(e?.response?.data?.message || "Ürün kaydedilirken bir hata oluştu.");
      setSaving(false);
    }
  };

  const toggleStatus = async (product) => {
    const nextStatus = !product.isActive;
    const message = nextStatus
      ? "Bu ürünü tekrar aktif yapmak istediğinize emin misiniz?"
      : "Bu ürünü pasife almak istediğinize emin misiniz?";

    if (!window.confirm(message)) return;

    setError("");
    setStatusLoadingId(product._id);
    try {
      const { data } = await updateProductStatus(product._id, nextStatus);
      setToast(
        data?.message ||
          (nextStatus ? "Ürün tekrar aktif edildi." : "Ürün pasife alındı.")
      );
      await fetchProducts();
    } catch (e) {
      setError(e?.response?.data?.message || "Ürün durumu güncellenemedi.");
    } finally {
      setStatusLoadingId("");
    }
  };

  return (
    <Layout>
      <div className="resourcePage productsPage">
        <div className="pageHead">
          <div>
            <h2 className="pageTitle">Ürün Yönetimi</h2>
            <p className="pageSub">
              Petshop ürünlerini ekleyin, güncelleyin ve aktiflik durumlarını yönetin.
            </p>
          </div>

          <div className="pageActions">
            <button className="btn primary" onClick={openCreate}>
              + Yeni Ürün Ekle
            </button>
          </div>
        </div>

        {toast ? <div className="adminToast adminToast--success">{toast}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <div className="productsWrap">
          <div className="productsFilters">
            <div className="searchBox productsFilters__search">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün ara..."
              />
            </div>

            <select
              className="productsSelect"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Tüm kategoriler</option>
              {availableCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              className="productsSelect"
              value={animalType}
              onChange={(e) => setAnimalType(e.target.value)}
            >
              <option value="">Tüm hayvan türleri</option>
              {ANIMAL_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              className="productsSelect"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Aktif + Pasif</option>
              <option value="true">Sadece aktif</option>
              <option value="false">Sadece pasif</option>
            </select>

            <select
              className="productsSelect"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="resourceToolbar productsToolbar">
            <div className="resourceCount">
              Ürün sayısı: <b>{items.length}</b>
            </div>

            <button className="btn soft" onClick={fetchProducts} disabled={loading}>
              {loading ? "Yenileniyor..." : "Yenile"}
            </button>
          </div>

          {loading ? (
            <div className="resourceEmpty">
              <div className="skeletonTitle" />
              <div className="skeletonLine" />
              <div className="skeletonLine" />
            </div>
          ) : items.length === 0 ? (
            <div className="resourceEmpty">
              <div className="emptyTitle">Ürün bulunamadı</div>
              <div className="emptyText">
                Filtreleri temizleyin veya yeni bir ürün ekleyin.
              </div>
              <button className="btn primary" onClick={openCreate}>
                + Yeni Ürün Ekle
              </button>
            </div>
          ) : (
            <div className="productsGrid">
              {items.map((product) => (
                <div className="productCard" key={product._id}>
                  <div className="productCard__visual">
                    <ProductImage src={product.imageUrl} alt={product.name || "Ürün"} />
                  </div>

                  <div className="productCard__content">
                    <div className="productCard__top">
                      <div>
                        <div className="productCard__title">{product.name || "Adsız ürün"}</div>
                        <div className="productCard__meta">
                          {product.category || "Kategori yok"} •{" "}
                          {ANIMAL_TYPE_OPTIONS.find((item) => item.value === product.animalType)
                            ?.label || "Genel"}
                        </div>
                      </div>

                      <div className="productCard__price">{formatCurrency(product.price)}</div>
                    </div>

                    <div className="productCard__description">
                      {product.description || "Açıklama yok."}
                    </div>

                    <div className="productCard__chips">
                      <span
                        className={`productChip ${
                          product.isActive ? "productChip--active" : "productChip--inactive"
                        }`}
                      >
                        {product.isActive ? "Aktif" : "Pasif"}
                      </span>
                      <span className="productChip productChip--neutral">
                        Stok: {product.stock ?? 0}
                      </span>
                      {product.featured ? (
                        <span className="productChip productChip--featured">Öne çıkan</span>
                      ) : null}
                    </div>

                    <div className="productCard__actions">
                      <button className="btn" onClick={() => openEdit(product)}>
                        Düzenle
                      </button>
                      <button
                        className={`btn ${product.isActive ? "danger" : "soft"}`}
                        onClick={() => toggleStatus(product)}
                        disabled={statusLoadingId === product._id}
                      >
                        {statusLoadingId === product._id
                          ? "Güncelleniyor..."
                          : product.isActive
                            ? "Pasife Al"
                            : "Aktif Yap"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="modalOverlay--fixed" onMouseDown={() => !saving && closeModal()}>
            <div className="modalCard--product modalAnim" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead--product">
                <div>
                  <div className="modalTitle--product">
                    {mode === "create" ? "Yeni Ürün Ekle" : "Ürün Düzenle"}
                  </div>
                  <div className="modalSub--product">
                    {mode === "create"
                      ? "Yeni bir petshop ürünü oluşturun."
                      : "Seçili ürünü güncelleyip kaydedin."}
                  </div>
                </div>

                <button
                  className="modalClose--product"
                  onClick={closeModal}
                  type="button"
                  disabled={saving}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={submit} className="modalBody--product">
                <div className="productFormGrid">
                  <div className="fieldGroup productFormGrid__full">
                    <label className="fieldLabel">Ürün adı</label>
                    <input
                      className="fieldInput"
                      value={form.name}
                      onChange={(e) => handleFormChange("name", e.target.value)}
                      placeholder="Örn: Kedi Maması 1.5 KG"
                      autoFocus
                    />
                  </div>

                  <div className="fieldGroup">
                    <label className="fieldLabel">Fiyat</label>
                    <input
                      className="fieldInput"
                      value={form.price}
                      onChange={(e) => handleFormChange("price", e.target.value)}
                      inputMode="decimal"
                      placeholder="Örn: 349.99"
                    />
                  </div>

                  <div className="fieldGroup">
                    <label className="fieldLabel">Stok</label>
                    <input
                      className="fieldInput"
                      value={form.stock}
                      onChange={(e) => handleFormChange("stock", e.target.value)}
                      inputMode="numeric"
                      placeholder="Örn: 25"
                    />
                  </div>

                  <div className="fieldGroup">
                    <label className="fieldLabel">Kategori</label>
                    <select
                      className="productsSelect productsSelect--field"
                      value={form.category}
                      onChange={(e) => handleFormChange("category", e.target.value)}
                    >
                      {availableCategories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fieldGroup">
                    <label className="fieldLabel">Hayvan türü</label>
                    <select
                      className="productsSelect productsSelect--field"
                      value={form.animalType}
                      onChange={(e) => handleFormChange("animalType", e.target.value)}
                    >
                      {ANIMAL_TYPE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fieldGroup productFormGrid__full">
                    <label className="fieldLabel">Görsel URL</label>
                    <input
                      className="fieldInput"
                      value={form.imageUrl}
                      onChange={(e) => handleFormChange("imageUrl", e.target.value)}
                      placeholder="https://example.com/urun.jpg"
                    />
                  </div>

                  <div className="fieldGroup productFormGrid__full">
                    <label className="fieldLabel">Açıklama</label>
                    <textarea
                      className="productEditor"
                      value={form.description}
                      onChange={(e) => handleFormChange("description", e.target.value)}
                      placeholder="Ürün açıklaması..."
                    />
                  </div>

                  <label className="productToggle">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => handleFormChange("isActive", e.target.checked)}
                    />
                    <span>Ürün aktif olarak yayınlansın</span>
                  </label>

                  <label className="productToggle">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) => handleFormChange("featured", e.target.checked)}
                    />
                    <span>Öne çıkan ürün olarak işaretle</span>
                  </label>
                </div>

                <div className="modalFoot--product">
                  <button className="btn primary" type="submit" disabled={saving}>
                    {saving
                      ? mode === "create"
                        ? "Kaydediliyor..."
                        : "Güncelleniyor..."
                      : mode === "create"
                        ? "Kaydet"
                        : "Güncelle"}
                  </button>

                  <button type="button" className="btn soft" onClick={closeModal} disabled={saving}>
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
