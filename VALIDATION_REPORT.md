# VALIDATION REPORT — RANAKARA AI Submission Candidate
**Tanggal audit source:** 30 Oktober 2026  
**Snapshot yang diuji:** salinan lokal integrasi RANAKARA v8.2 + NLP v3.2 (`ranakara_v82_test`)  
**GitHub production commit:** [BELUM DIVERIFIKASI]  
**Vercel production URL:** [BELUM DIVERIFIKASI DALAM SESI INI]

## 1. Audit kode otomatis
- `npm test`: **115/115 tes lulus** setelah perbaikan harness `tests/ui-smoke.test.mjs` yang menunggu promise bootstrap selesai sebelum memulihkan mock `sessionStorage`. Run sebelumnya: **115 pass / 1 fail** akibat unhandled rejection test async. Ini merupakan penyesuaian pengujian, bukan perbaikan bug produksi. Snapshot lokal, bukan repo live.
- `npm run build`: **PASS**, berupa pemeriksaan sintaks/berkas statis (bukan pembuktian deployment jaringan).
- Kategori pengujian: model NLP, revisi/negasi, validasi jumlah, katalog global, resep global, perencanaan bahan, safety, UI/animasi dan mode demo.
- Pemeriksaan pola kunci rahasia umum pada berkas lokal (`sk-`, service_role JWT pattern, private-key header) **tidak menemukan kecocokan** pada berkas yang dipindai; tidak mengesampingkan secret lain di commit lama atau server.

## 2. Evaluasi NLP berlabel
| Dataset | Versi | Hasil | Interpretasi |
|---|---|---|---|
| 120 pesan baru sintetis, 12 kategori | v3.1 | 115/120 tepat (95,8%) | Audit sintetis sebelum patch v3.2; bukan pelanggan nyata |
| 120 pesan yang sama setelah patch | v3.2 | 120/120 tepat | Regresi; telah dipakai memperbaiki model, **bukan independent test** |

Temuan audit v3.1: permintaan sopan, koreksi `maksud saya`, perubahan produk tertentu, koreksi tanpa jumlah pengganti, dan rentang `antara A dan B`. Patch v3.2 diuji ulang; perbaikan tidak berarti seluruh masukan bahasa Bali sudah aman.

## 3. MRP dan validitas resep
MRP menerapkan `Σ(unit dipesan × bahan/unit)`, lalu `max(0,kebutuhan-stok)` bagi pesanan aktif. Master publik yang ditinjau berisi 34 produk referensi dengan **nol** resep numerik global berstatus terverifikasi. Tanpa takaran yang disetujui pelaku usaha, angka kebutuhan material tidak boleh dinyatakan representatif. Hasil demo memakai contoh sintetis/seed.

## 4. Kontrol data dan keterbatasan keamanan
Skema `supabase/schema.sql` mengaktifkan RLS pada `public.workspaces`, mensyaratkan `auth.uid() = user_id` untuk SELECT, INSERT, UPDATE dan DELETE. Ini adalah **pemeriksaan statis kebijakan**, bukan uji eksploitasi atau uji live lintas akun. Masing-masing pengguna tetap wajib diuji pada proyek Supabase produksi. Kunci `anon/publishable` bersifat publik; `service_role`/API secret tidak boleh berada di browser atau repository.

## 5. Gate sebelum submission (wajib uji langsung)
- [ ] URL Vercel HTTPS aktif dengan tab incognito dan jaringan HP.
- [ ] GitHub `main` sudah memuat dokumen baru dan tidak mengekspos secret; cek *commit history*.
- [ ] Uji **dua akun berbeda**: akun B tidak dapat membaca stok/pesanan akun A.
- [ ] Akun sama lintas perangkat: sinkronisasi pesanan dan perubahan status benar.
- [ ] AI analisis & koreksi, hasil ambigu tidak dapat disimpan tanpa konfirmasi.
- [ ] MRP cocok dengan perhitungan manual **untuk satu resep yang benar-benar terverifikasi**.
- [ ] Mode demo tidak menulis ke data cloud; kembali ke akun nyata tanpa data tercampur.
- [ ] Pustaka global 34 referensi tersedia untuk akun baru.
- [ ] Refresh, logout, dan backup bekerja; data tetap bertahan.
- [ ] Mobile usability: viewport sempit, navigasi, keyboard dan reduced-motion.
- [ ] URL, kontak ketua, identitas tim, tag/commit SHA sesuai form kompetisi.

## 6. Cara reproduksi
```bash
npm test
npm run build
python3 -m http.server 8080 -d public
```
Uji browser live di Vercel terpisah setelah upload dokumen. Simpan video/screenshot dari *clean-start*, bukan dari data hasil yang disiapkan sebelumnya. Jangan melabeli 115 tes Node sebagai 115 percobaan UMKM nyata.

## 7. Keputusan audit
**Dokumentasi kandidat submission siap diunggah. Klaim `submission ready` masih bersyarat** pada kelulusan gate browser live, informasi tim/URL/tag lengkap, dan persetujuan pengungkapan AI. Implementasi MRP untuk semua jenis upakara belum dapat diklaim lengkap secara produksi sebelum ada takaran tervalidasi.
