# AI & Technology Disclosure — RANAKARA AI
**Kompetisi:** Bali DigiFest 2026 — AI Web Innovation Challenge  
**Versi implementasi yang didokumentasikan:** RANAKARA-NLP v3.2 + Pusat Resep Global v8.2  
**Tanggal penyusunan:** 30 Oktober 2026  
**URL website / commit penilaian:** [ISI URL VERCEL] / [ISI SHA ATAU TAG]

| Komponen | Pengungkapan |
|---|---|
| Nama produk | RANAKARA AI — Order Intelligence & Material Planning untuk UMKM Upakara Bali |
| Frontend | HTML5, CSS3, ES modules JavaScript; pengalaman Bali Immersive, navigasi mobile |
| Backend / runtime | Frontend statis Vercel; NLP dieksekusi lokal di browser; akses langsung ke Supabase REST Auth/DB |
| Database / auth | Supabase Auth dan Postgres `public.workspaces` (`data` JSONB) dengan RLS sesuai `user_id` |
| Hosting | Vercel Hobby untuk demo/nonkomersial; penggunaan komersial mengikuti ketentuan platform |
| AI model | **RANAKARA-NLP v3.2**, hybrid ML + rule-based NLP. Char 2/3-gram TF-IDF 1-NN untuk pengenalan produk; klasifikasi maksud berbasis contoh berlabel; parser aturan untuk angka, revisi, tanggal, pembatalan, ambiguitas |
| Komponen AI material | Mengubah pesan bebas menjadi kandidat produk, kuantitas, maksud, dan pertanyaan klarifikasi sebelum pencatatan |
| Bagian non-AI | Validasi pesanan, RLS, penjumlahan kebutuhan bahan, kalkulasi kekurangan stok, UI/animasi, dan ekspor CSV |
| API AI eksternal saat demo | **Tidak digunakan**. Riwayat versi awal pernah memakai OpenAI/Netlify, tetapi alur terbaru tidak melakukan inferensi melalui OpenAI API |
| Data/pelatihan | Nama & alias 34 produk referensi upakara dan contoh intent sintetis berlabel yang disiapkan pada source. Ini **bukan** pelatihan LLM atau dataset percakapan pelanggan nyata |
| Data pengguna | Konten pesanan diproses di browser untuk inferensi. Setelah konfirmasi dapat disimpan di Supabase workspace akun; pengguna dianjurkan menghapus PII dari pesan |
| Resep global | Referensi 34 jenis dan bahan/komponen. **0 resep numerik publik dinyatakan tervalidasi** dalam master rilis yang diperiksa. Data UMKM privat tidak dipublikasikan otomatis |
| Visual/aset | Ilustrasi gapura/canang untuk UI dibuat dengan bantuan generative AI; dekoratif dan bukan foto dokumentasi lapangan. Jelaskan aset pihak ketiga dan lisensi jika ditambahkan lagi |
| Pustaka/layanan pihak ketiga | JavaScript standar browser, Supabase, Vercel, referensi sumber upakara. Inventaris dependensi disesuaikan dengan repo final |
| AI coding/development assistant | ChatGPT/OpenAI digunakan untuk brainstorming, penulisan kode, debug, perancangan UI, pembuatan aset ilustrasi, serta drafting dokumentasi. Seluruh keluaran wajib ditinjau dan diuji oleh tim |
| Pre-existing components | MVP awal, katalog, skema Supabase, NLP generasi sebelumnya, desain dan eksperimen deployment telah dikembangkan sebelum snapshot submission; **tanggal dan perubahan sebelum/selama lomba harus dilengkapi tim sesuai riwayat commit** |

## Cara memverifikasi penggunaan AI pada source
1. Buka `public/ranakara-nlp.mjs`, cari fungsi `fit()`, `bestMatch()`, `classifyIntent()`, dan `extractLocalOrder()`.
2. Jalankan masukan `Pesan 20 pejati, kurangi 5` serta `Segehan agung antara 2 dan 5 buah`, periksa hasil terstruktur / klarifikasi.
3. Buka `public/app.mjs` untuk melihat panggilan `extractLocalOrder()` dan verifikasi manusia sebelum penyimpanan.
4. Buka `public/engine.mjs` untuk membuktikan MRP bersifat deterministik, bukan dihasilkan LLM.

## Hasil pengujian dan batas klaim
- Snapshot lokal v8.2: 115/115 tes Node + build berhasil. Perlu pemeriksaan ulang pada commit submission.
- Audit v3.1: 115/120 pesan sintetis (95,8%). Lima kegagalan diketahui.
- v3.2: 120/120 **regresi** setelah perbaikan lima kasus tersebut; hasil bukan *blind test*, bukan akurasi pengguna nyata.
- Belum ada evaluasi lapangan UMKM yang terdokumentasi sebagai dataset independen; **jangan mengarang metrik dampak**.

## Orisinalitas, data dan tanggung jawab
Tim bertanggung jawab untuk memverifikasi kelayakan kode, izin penggunaan aset, akurasi metadata sumber, perlindungan akun dan kepatuhan panduan lomba. Resep/komposisi tradisional bervariasi menurut konteks budaya; sistem tidak menggantikan keputusan pengrajin. Kode dan gambar buatan AI dikurasi manusia. Data demonstrasi dibedakan dari data asli.

**Pernyataan tim:** Informasi disclosure ini merepresentasikan source versi yang diperiksa. Ketua dan seluruh anggota harus memeriksa serta menyetujui sebelum mengunggah.  
**Disahkan oleh:** [NAMA KETUA/TIM, TANGGAL]
