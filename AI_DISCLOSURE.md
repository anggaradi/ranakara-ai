# AI & Technology Disclosure — RANAKARA AI v1.0

**Status:** template laporan implementasi sumber kode; perbarui setelah integrasi dan deploy benar-benar diuji.

| Kategori | Disclosure |
|---|---|
| Product | RANAKARA AI |
| Frontend | HTML, CSS, JavaScript ES modules (tanpa framework runtime) |
| Backend | Netlify Functions, JavaScript Node runtime |
| Database | Supabase PostgreSQL — tabel `workspaces`, RLS berdasarkan `auth.uid()`; localStorage untuk mode demo non-cloud |
| Hosting | Netlify (setelah deployment sukses) |
| AI | OpenAI Responses API, strict structured JSON schema; default model `gpt-4o-mini`, dapat diatur dengan `OPENAI_MODEL` |
| Peran AI | Memahami teks pesanan tidak terstruktur dan mengembalikan item, kuantitas, informasi tenggat, dan pertanyaan klarifikasi |
| Non-AI logic | Mesin perencanaan kebutuhan material deterministik di `public/engine.mjs` |
| Dataset | Saat ini data katalog dan contoh bahan **sintetis/ilustratif**; dataset evaluasi nyata belum dikumpulkan |
| Libraries | Tidak menggunakan npm runtime package; standard Fetch API / Web API / Node.js |
| Template | Kode sumber disusun khusus untuk konsep RANAKARA AI; tidak memakai template UI berlisensi |
| AI Coding Assistant | ChatGPT digunakan untuk menyusun source code, dokumentasi, dan rancangan test. Tim harus menguji serta memahami kodenya sebelum submission. |
| Pre-existing components | Tidak ada komponen proyek lama yang disertakan dalam arsip ini. Jika kemudian menggunakan aset lama, wajib diperbarui. |
| Third-party services | Netlify, Supabase, OpenAI API — mengikuti Terms dan Privacy masing-masing. |
| Third-party assets | Tidak ada foto/font pihak ketiga dalam website ini; font menggunakan sistem perangkat pengguna. |

## Risiko & batasan

- Hasil LLM **dapat salah** secara semantik walau sesuai JSON schema. User wajib konfirmasi.
- `OPENAI_API_KEY` disimpan hanya di environment variable pada server.
- Endpoint AI memverifikasi Supabase JWT lewat endpoint Auth sebelum memanggil AI berbayar.
- Isi chat pelanggan dikirim ke API AI pihak ketiga setelah pengguna menjalankan tombol Analisis. Gunakan teks yang dianonimkan dan persetujuan yang sesuai.
- Penggunaan model memakai `store:false` di API request, namun kewajiban privasi dan retensi pihak ketiga harus tetap diperiksa menurut ketentuan yang berlaku.
- Belum dilakukan audit penetrasi, pengujian beban, dan monitoring rate limit khusus per user.
- Model bukan sistem keuangan, sistem inventori transaksional penuh, atau alat yang memahami seluruh variasi adat secara otomatis.
