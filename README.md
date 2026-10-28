# RANAKARA AI — Bali DigiFest 2026 (MVP 1.0)

**Produk web AI untuk penjual sarana upacara di Bali:** pesan pelanggan -> ekstraksi bahasa alami oleh AI -> verifikasi manusia -> pesanan tersimpan -> kebutuhan bahan produksi.

> Status: kode prototipe siap build statis dan diuji lokal; **belum boleh diklaim telah diuji end-to-end dengan OpenAI, Supabase, dan Netlify** hingga kredensial asli ditambahkan, website di-deploy, dan pengujian live lulus. Tidak ada demo AI palsu.

## Fitur yang sudah diimplementasikan di source code

- Dashboard jumlah pesanan, pesanan aktif, dan kekurangan bahan.
- Katalog produk beserta alias nama lokal, bahan, stok, dan resep jumlah bahan per produk.
- Studio pesanan berbasis teks: memanggil AI online lewat Netlify Function **hanya untuk pengguna yang sudah login**; keluaran terstruktur, validasi katalog, deteksi kemungkinan ambiguitas.
- Alternatif **draf manual** yang jelas dibedakan dari AI — berguna saat belum punya API key.
- Konfirmasi pengguna sebelum menyimpan pesanan, termasuk tanggal yang wajib jelas.
- Perencanaan bahan deterministik, tidak memakai AI untuk aritmetika.
- Status pesanan baru/diproses/selesai/dibatalkan; ekspor kebutuhan CSV & backup data JSON.
- Penyimpanan demo di browser (`localStorage`); penyimpanan cloud per user di Supabase (`RLS`).

## Yang belum masuk versi 1.0

OCR screenshot WhatsApp, WhatsApp Business API, prediksi permintaan, pengelolaan supplier, multi-karyawan, autentikasi MFA, sistem pengurangan stok otomatis, dan jaminan kesesuaian takaran bahan untuk seluruh tradisi upacara. **Jangan klaim fitur tersebut ada pada formulir.**

## Struktur repo

```
public/                  # HTML, CSS, UI JS, engine perencanaan
netlify/functions/       # endpoint AI server-side (bukan browser)
supabase/schema.sql      # tabel & row level security
scripts/check.mjs        # build check
 tests/                   # regression tests
netlify.toml             # publish folder dan fungsi server
```

## Menguji tanpa layanan eksternal

1. Pasang Node.js 20+.
2. Jalankan `npm test` dan `npm run build`.
3. Untuk melihat UI lokal tanpa API/backend, jalankan `python3 -m http.server 8080 -d public`, lalu buka `http://localhost:8080`.
4. Website menjalankan **mode demo lokal**, hanya memakai browser storage. AI online tidak aktif sampai Supabase dan OpenAI API diatur.

## Konfigurasi AI + cloud + Netlify

Baca [`DEPLOY_NETLIFY.md`](DEPLOY_NETLIFY.md) langkah demi langkah. Syarat utama:

- Supabase Auth, database `workspaces` dengan Row Level Security.
- `public/config.js` berisi **hanya** Supabase project URL dan anon/public publishable key.
- Environment variables **di Netlify Functions**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, optional `OPENAI_MODEL` (default `gpt-4o-mini`).
- Deploy melalui GitHub -> Netlify, publish `public`, build `npm run build`.
- Uji login, output AI pada pesanan baru, penyimpanan cloud sesudah reload, dan perhitungan bahan.

API key OpenAI **tidak boleh** dimasukkan dalam `public/config.js`, HTML, JS frontend, atau commit GitHub.

## Penilaian dan disclosure

Referensi: *Panduan Peserta AI Web Innovation Challenge Bali DigiFest 2026*, halaman 2–10. Ketentuan: website live, AI material, GitHub bisa diakses juri, proposal PDF, dan disclosure teknologi. Semua penggunaan AI coding assistant dan data sumber harus diungkapkan jujur. Lihat `AI_DISCLOSURE.md` dan `FORM_SUBMISSION.md`.

## Data contoh

Produk `Canang sari` dan `Pejati` serta angka bahan di seed adalah **ILUSTRASI** untuk demonstrasi logika. Jangan diperlakukan sebagai standar komposisi adat. Ganti menggunakan catatan dari UMKM yang bersedia berpartisipasi.

## Pengujian yang belum dilakukan

Sebelum submission: evaluasi ekstraksi AI pada dataset pesanan berlabel; uji keliru-katalog/ambiguitas; pengujian kelompok pengguna; test URL Netlify live; validasi privasi; audit keamanan lanjut; Netlify runtime. Jika ada kegagalan, perbaiki dulu sebelum mengisi "sudah berfungsi".

## Hak dan lisensi

Draf proyek ditujukan untuk tim RANAKARA AI. Komponen dari pihak ketiga (Netlify, Supabase, OpenAI) tunduk pada persyaratan masing-masing. Source code tidak memuat model berbayar atau data pelanggan.
