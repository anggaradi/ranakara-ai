# RANAKARA AI — Bali DigiFest 2026

**Order Intelligence & Material Planning untuk UMKM Upakara Bali**  
**Kategori:** Mahasiswa/Umum — Business & MSME Digitalization  
**Status:** MVP fungsional; validasi lapangan dan seluruh takaran resep belum selesai.  
**Repository:** https://github.com/anggaradi/ranakara-ai  
**Website:** [ISI URL VERCEL AKTIF DARI DASHBOARD]  
**Rilis yang diajukan:** [ISI TAG / COMMIT SHA SETELAH FINALISASI]

## Deskripsi, masalah dan pengguna
RANAKARA AI membantu pengrajin/penjual sarana upacara Bali mengubah pesan informal pelanggan menjadi draf pesanan terstruktur, meninjau dan mengonfirmasi item, mencatat status pesanan, dan menghitung kebutuhan bahan berdasarkan resep yang tersedia. Sasaran awal: pelaku UMKM upakara yang menerima pesanan melalui pesan teks dan memerlukan pencatatan serta rencana produksi yang konsisten.

## Fitur yang telah diimplementasikan
- **AI Order Studio:** analisis pesan teks dengan NLP lokal di browser; pengenalan produk dari katalog/alias; klasifikasi maksud pesanan; ekstraksi jumlah, revisi, pembatalan, dan klarifikasi ambiguitas.
- **Human-in-the-loop:** hasil AI tidak otomatis menjadi pesanan; pengguna memverifikasi jumlah/tanggal; penyimpanan pesanan ambigu memerlukan verifikasi tambahan.
- **Katalog publik:** 34 jenis referensi upakara, alias, daftar bahan/komponen; pengguna baru memperoleh referensi secara otomatis.
- **Global Recipe Library:** daftar bahan publik dan penanda validasi; takaran numerik global belum dipublikasikan sebagai resep terverifikasi (0/34 pada rilis referensi yang diperiksa).
- **Manajemen pesanan & MRP:** status Baru / Diproses / Selesai / Dibatalkan; MRP menghitung jumlah bahan = Σ(qty produk × takaran bahan per unit) lalu kekurangan = max(0, kebutuhan - stok); perhitungan hanya valid untuk produk yang resep numeriknya telah dilengkapi.
- **Mode demo juri:** contoh simulasi terpisah dari data bisnis; tidak boleh disamakan dengan data pelanggan nyata.
- **Workspace privat:** Supabase Auth dan tabel `public.workspaces` dengan Row Level Security per `user_id`; mode demo lokal tersedia tanpa login.
- **UX Bali Immersive:** gapura dan ornamentasi canang, transisi, navigasi mobile, pencarian katalog, serta dukungan mengurangi animasi.

## Arsitektur dan alur
```
Pesan teks → Browser (Vercel static frontend)
           → RANAKARA-NLP v3.2 (TF-IDF char 2/3-gram, 1-NN produk,
              classifier intent berbasis contoh berlabel, parser aturan)
           → Draf terstruktur + alasan klarifikasi → Persetujuan manusia
           → Supabase Auth + workspaces JSONB (RLS, milik akun)
           → MRP deterministik → Kebutuhan bahan / kekurangan stok
```
Modul utama: `public/ranakara-nlp.mjs` (NLP), `public/app.mjs` (UI & workflow), `public/engine.mjs` (validasi dan MRP), `public/global-catalog.*`, `public/global-recipes.json`, `public/recipe-bom-import.mjs`. `netlify/functions/` dan dokumen `DEPLOY_NETLIFY.md` di repository lama merupakan artefak historis dan **bukan** bagian dari alur produksi Vercel saat ini.

## Model AI dan alasan pemilihan
`RANAKARA-NLP v3.2` merupakan **hybrid machine learning + rule-based NLP**, **bukan LLM atau AI generatif**. Model menggunakan TF-IDF karakter n-gram dan 1-nearest-neighbor pada nama/alias produk serta klasifikasi intent berdasarkan contoh kalimat berlabel. Parser deterministik menangani kuantitas/tanggal, revisi, dan aturan keselamatan. Inferensi berlangsung di browser dan tidak memerlukan OpenAI API. AI diperlukan karena variasi bahasa informal, istilah upakara, dan koreksi percakapan tidak dapat ditangani dengan memilih produk dari daftar statis saja. Hasil AI harus diverifikasi manusia.

## Cara menjalankan lokal
Prasyarat: Node.js >=20 dan Python 3 (untuk server statis opsional).
```bash
npm test
npm run build
python3 -m http.server 8080 -d public
```
Lalu buka http://localhost:8080. Untuk sinkronisasi, buat Supabase project, aktifkan Auth, jalankan `supabase/schema.sql`, dan isi **hanya** Supabase project URL + public anon/publishable key di `public/config.js`. Jangan menaruh service_role key, token privat, atau password di frontend. `public/config.js` belum tentu siap pakai dalam setiap salinan source; cek isinya setelah clone.

## Deploy Vercel
- Import repository GitHub; preset `Other`.
- Root Directory `./`; Output Directory `public`.
- Build command dapat dikosongkan jika *Override* diaktifkan; alternatif jalankan `npm run build` setelah sinkronisasi script pemeriksaan pada branch saat ini.
- Masukkan URL Vercel aktif ke Supabase Auth Redirect URLs bila menggunakan tautan login yang memerlukan redirect.
- Verifikasi HTTPS, login, data lintas browser, NLP, validasi tanggal, dan perhitungan resep sebelum submission.

## Pengujian dan bukti
Pada snapshot source lokal v8.2 yang diuji: **115/115 tes Node lulus** dan `npm run build` lulus (30 Okt 2026). Ini pengujian kode lokal, bukan verifikasi deployment produksi. Evaluasi NLP v3.1 pada **120 pesan sintetis baru** memperoleh **115/120 kecocokan pesan penuh (95,8%)**. Setelah lima isu diperbaiki, v3.2 lulus **120/120 tes regresi yang sama**; hasil ini **tidak boleh diklaim sebagai akurasi independen**. Perlu data percakapan pelanggan anonim dan berizin untuk evaluasi lanjutan. Detail dalam `VALIDATION_REPORT.md`.

## Keterbatasan
- Takaran numerik global 34 produk belum dinyatakan lengkap/terverifikasi. Daftar bahan referensi bukan resep universal; variasi desa adat dan pengrajin perlu dihormati.
- Belum ada integrasi langsung WhatsApp API, OCR pesan gambar, forecast permintaan, auto-deduct stok, supplier automation, dan validasi lapangan formal.
- Model berbasis katalog bisa salah mengenali istilah, revisi ambigu, negasi, dan konteks panjang; keputusan akhir tetap pada pengguna.
- Tidak ada pengujian keamanan penetrasi independen atau jaminan 100% bebas bug.

## Tim dan kepemilikan
**Tim:** RANAKARA AI. **Ketua:** [ISI SESUAI FORM PENDAFTARAN]. **Anggota:** [ISI JIKA ADA, MAKS. 3 ORANG TOTAL]. **Institusi:** [ISI SESUAI FORM].

## Disclosure, aset dan komponen sebelum kompetisi
Pengembangan menggunakan bantuan AI untuk penulisan/revisi kode, eksplorasi desain, dokumentasi, dan gambar ilustrasi. Penggunaan alat AI adalah *development assistance*; AI dalam produk adalah NLP lokal yang dapat diuji pada browser. Aset gapura/canang dekoratif hasil generasi ilustratif, **bukan foto dokumentasi pengrajin**. Supabase dan Vercel merupakan layanan pihak ketiga; dataset referensi upakara berasal dari penelusuran literatur dan memerlukan validasi serati. Lihat `AI_DISCLOSURE.md`. Riwayat prototipe dan revisi dibuat sebelum submission dan wajib diungkapkan sesuai panduan.

## Privasi dan keselamatan
Hindari menempelkan nama lengkap, nomor HP, alamat pelanggan, atau percakapan tanpa izin. Data workspace per pengguna dibatasi oleh Supabase RLS; tidak ada klaim audit keamanan independen. Jangan mempublikasikan akun demo/password di README—berikan lewat form/kontak panitia saja. Materi upakara bersifat referensi operasional, bukan pedoman ritual universal.
