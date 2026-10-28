# PANDUAN DEPLOY RANAKARA AI KE NETLIFY

**Alur yang direkomendasikan:** GitHub -> Netlify continuous deployment. Jangan drag-and-drop ZIP langsung sebagai "site statis" lalu mengharapkan function AI bekerja otomatis; gunakan build dari repository.

## 1. Buat Supabase Project

1. Buka https://supabase.com/dashboard; buat project (ingat password database pribadi, jangan bagikan ke chat).
2. Masuk SQL Editor dan jalankan seluruh isi `supabase/schema.sql` satu kali.
3. Di Authentication -> Providers -> Email, pastikan provider Email aktif. Daftar akun bisa memerlukan konfirmasi email jika konfigurasi bawaan mengaktifkannya.
4. Salin `Project URL` dan `anon key` (atau public publishable key sesuai antarmuka project). Pastikan jenis key sesuai endpoint `/rest/v1` dan `/auth/v1`.
5. **RLS wajib aktif**. Uji bahwa user A tidak bisa membaca data user B. Project contoh tidak boleh memakai service-role key pada browser.

## 2. Isi public config

Edit `public/config.js`:

```javascript
window.RANAKARA_CONFIG = {
  supabaseUrl: "https://PROJECT_ID.supabase.co",
  supabaseAnonKey: "PUBLIC_ANON_KEY"
};
```

Yang ini **public**, aman dipublikasikan jika RLS benar. Jangan isi API key OpenAI di sini. `supabaseAnonKey` **bukan** service_role key.

## 3. Siapkan OpenAI API

1. Buka https://platform.openai.com/api-keys, buat API key khusus project (API memiliki pengaturan tagihan/kuota sendiri).
2. Atur batas anggaran penggunaan API dan monitor pemakaiannya.
3. Jangan kirim API key ke orang lain atau menuliskannya di GitHub.

## 4. Upload ke GitHub

Ekstrak ZIP; dari folder root jalankan:

```bash
npm test
npm run build
git init
git add .
git commit -m "feat: ranakara MVP 1.0"
```

Buat repository GitHub, lalu ikuti perintah `git remote add origin ...` dan `git push -u origin main` dari GitHub. Jika branch kamu `master`, ubah menjadi `main` (`git branch -M main`).

## 5. Deploy Netlify

1. Netlify -> Add new project -> Import from Git -> pilih repo.
2. Build command: `npm run build`.
3. Publish directory: `public`.
4. Functions directory: `netlify/functions` (tersedia dalam `netlify.toml`).
5. Di Project configuration -> Environment variables, buat:

| Variable | Value | Rahasia? |
|---|---|---|
| `SUPABASE_URL` | sama dengan public config | bukan secret |
| `SUPABASE_ANON_KEY` | sama dengan public config | public key |
| `OPENAI_API_KEY` | API key dari OpenAI | **YA, rahasia** |
| `OPENAI_MODEL` | `gpt-4o-mini` atau model yang mendukung structured outputs | bukan secret |

Pastikan scope lingkungan tersedia untuk **Functions**. Jangan memasukkan OPENAI_API_KEY ke Build command, HTML atau source code.
6. Trigger deploy. Buka URL `*.netlify.app`, pilih **Masuk / Daftar**, daftar dengan email sendiri, konfirmasi email jika diminta, kemudian login.
7. Jika SQL belum dijalankan, penyimpanan cloud akan gagal. Perbaiki konfigurasi terlebih dahulu.

## 6. Verifikasi nyata WAJIB

- [ ] Website dapat dibuka di mode incognito pada HP/laptop lain.
- [ ] Login akun demo juri berhasil.
- [ ] Tambah produk, material, komposisi; refresh halaman, data tetap ada.
- [ ] Masukkan chat berbeda dari contoh di README, klik "Analisis dengan AI"; tunggu hasil nyata dari OpenAI API.
- [ ] Untuk chat ambigu, sistem meminta klarifikasi. Pastikan item tidak otomatis tersimpan.
- [ ] Konfirmasi pesanan dengan tanggal jelas; cek Rencana Produksi.
- [ ] Bandingkan jumlah bahan terhadap hitungan manual.
- [ ] Ubah status "Selesai", kebutuhan aktif berkurang; stok inventori **tidak** otomatis dipotong.
- [ ] Gunakan akun kedua untuk menguji RLS (akun kedua tidak melihat data akun pertama).
- [ ] Uji dengan API key yang dinonaktifkan untuk memastikan error jelas, bukan hasil palsu.
- [ ] Periksa Netlify Function logs apabila error.
- [ ] Set limit API dan pastikan kapasitas cukup selama penjurian.
- [ ] Setelah lolos, buat Git tag `v1.0-submission` dan cantumkan di formulir.

## Troubleshooting

- **AI 401**: login cloud belum dilakukan atau sesi kadaluwarsa.
- **AI 503 konfigurasi**: `OPENAI_API_KEY` / `SUPABASE_URL` / `SUPABASE_ANON_KEY` belum terpasang di Netlify environment variables.
- **AI 503 model/kuota**: periksa billing, akses model, dan log Netlify.
- **Cloud save 403 / 404**: schema SQL/RLS belum dijalankan, URL/key keliru, atau user tidak terautentikasi.
- **AI 404**: fungsi server belum ikut ter-deploy; pastikan deploy via Git, periksa fungsi `extract-order` pada Netlify.
- **Halaman login konfirmasi email**: cek Inbox/Spam atau pengaturan Supabase Auth.

Catatan: public key Supabase dan session token tetap membutuhkan pengendalian keamanan. Versi 1.0 adalah MVP kompetisi, bukan produk siap produksi massal atau audit keamanan profesional.
