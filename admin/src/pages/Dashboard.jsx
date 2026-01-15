import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import http from "../api/http";

export default function Dashboard() {
  const [stats, setStats] = useState({ blogs: 0, clinics: 0, appointments: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const fetchStats = async () => {
    setErr("");
    setLoading(true);

    try {
      const [blogsRes, clinicsRes, appsRes] = await Promise.all([
        http.get("/api/blogs"),
        http.get("/api/clinics"),
        http.get("/api/appointments"), 
      ]);

      const blogsArr = Array.isArray(blogsRes.data)
        ? blogsRes.data
        : blogsRes.data?.blogs || [];

      const clinicsArr = Array.isArray(clinicsRes.data)
        ? clinicsRes.data
        : clinicsRes.data?.clinics || [];

      const appsArr = Array.isArray(appsRes.data)
        ? appsRes.data
        : appsRes.data?.appointments || [];

      setStats({
        blogs: blogsArr.length,
        clinics: clinicsArr.length,
        appointments: appsArr.length,
      });
    } catch (e) {
      setErr(e?.response?.data?.message || "Dashboard verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <Layout>
      <div className="dashboardPage">
        <div className="dashboardHead">
          <div>
            <h2 className="dashboardTitle">Dashboard</h2>
            <p className="dashboardSub">
              Genel durum ve hızlı erişim alanı. Veriler anlık olarak güncellenir.
            </p>
          </div>

          <button
            className="btn btn--ghost dashboardRefresh"
            onClick={fetchStats}
            disabled={loading}
          >
            {loading ? "Yenileniyor..." : "Yenile"}
          </button>
        </div>

        {err && <div className="alert alert--error">{err}</div>}

        <div className="dashboardGrid">
          <div className="dashStat">
            <div className="dashStat__top">
              <div className="dashStat__title">Toplam Blog</div>
              <div className="dashStat__icon" aria-hidden="true">
                📝
              </div>
            </div>
            <div className="dashStat__value">
              {loading ? "—" : stats.blogs}
            </div>
            <div className="dashStat__hint">Bloglar menüsünden ekle/düzenle/sil.</div>
          </div>

          <div className="dashStat">
            <div className="dashStat__top">
              <div className="dashStat__title">Toplam Klinik</div>
              <div className="dashStat__icon" aria-hidden="true">
                🏥
              </div>
            </div>
            <div className="dashStat__value">
              {loading ? "—" : stats.clinics}
            </div>
            <div className="dashStat__hint">Klinikler menüsünden yönetebilirsin.</div>
          </div>

          <div className="dashStat">
            <div className="dashStat__top">
              <div className="dashStat__title">Randevular</div>
              <div className="dashStat__icon" aria-hidden="true">
                📅
              </div>
            </div>
            <div className="dashStat__value">
              {loading ? "—" : stats.appointments}
            </div>
            <div className="dashStat__hint">
              Randevular menüsünden tüm kayıtları görüntüle/sil.
            </div>
          </div>
        </div>

        <div className="dashCard">
          <div className="dashCard__badge">DenizVet Admin</div>
          <h3 className="dashCard__title">Hoş geldin 👋</h3>
          <p className="dashCard__desc">
            Bu panel üzerinden sistemin temel yönetim işlemlerini tek yerden
            yapabilirsin. Soldaki menüyü kullanarak ilgili modüle geçmen yeterli.
          </p>

          <div className="dashCard__cols">
            <div className="dashInfo">
              <div className="dashInfo__head">
                <span className="dashInfo__dot" />
                <div className="dashInfo__title">Blog Yönetimi</div>
              </div>
              <ul className="dashList">
                <li>Yeni blog ekleme</li>
                <li>Mevcut blogları düzenleme</li>
                <li>Blog silme</li>
                <li>İçerik + görsel linki kontrolü</li>
              </ul>
              <div className="dashInfo__foot">Menü: <b>Bloglar</b></div>
            </div>

            <div className="dashInfo">
              <div className="dashInfo__head">
                <span className="dashInfo__dot" />
                <div className="dashInfo__title">Klinik Yönetimi</div>
              </div>
              <ul className="dashList">
                <li>Klinik ekleme</li>
                <li>Klinik bilgilerini düzenleme (adres/şehir/telefon vb.)</li>
                <li>Klinik silme</li>
                <li>Kayıtlı klinikleri arama / filtreleme</li>
              </ul>
              <div className="dashInfo__foot">Menü: <b>Klinikler</b></div>
            </div>

            <div className="dashInfo">
              <div className="dashInfo__head">
                <span className="dashInfo__dot" />
                <div className="dashInfo__title">Randevu Yönetimi</div>
              </div>
              <ul className="dashList">
                <li>Tüm randevuları listeleme</li>
                <li>Durumları görüntüleme (Onaylandı/Tamamlandı/İptal)</li>
                <li>Hatalı/iptal edilen kayıtları silme</li>
                <li>Klinik ve tarih bilgilerini kontrol etme</li>
              </ul>
              <div className="dashInfo__foot">Menü: <b>Randevular</b></div>
            </div>
          </div>

          <div className="dashCard__note">
            <span className="dashCard__noteIcon" aria-hidden="true">🔒</span>
            <span>
              Yetkisiz işlemler engellenir ve oturum korunur.
              Değişikliklerden sonra <b>Yenile</b> ile sayıları güncelleyebilirsin.
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
