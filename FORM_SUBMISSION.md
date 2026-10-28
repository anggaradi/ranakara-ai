# Draf isian formulir Bali DigiFest (jangan klaim fitur belum diuji)

**Nama Produk:** RANAKARA AI  
**Bidang Solusi:** UMKM & Bisnis  
**Status Project:** Dibangun khusus/baru untuk kompetisi ini (jika faktanya demikian).  

**Elevator Pitch:** RANAKARA AI adalah aplikasi web yang membantu UMKM sarana upacara di Bali mengubah pesan pesanan pelanggan yang tidak terstruktur menjadi data pesanan yang bisa diperiksa dan dikonfirmasi. Setelah diverifikasi, pesanan dihubungkan ke katalog bahan untuk menghasilkan kebutuhan produksi dan informasi kekurangan stok. Sasaran utamanya adalah pemilik dan pengelola usaha sarana upacara yang menerima pesanan melalui chat.

**Masalah:** Informasi nama produk, jumlah, varian dan tenggat dapat tersebar di chat dan perlu ditransfer manual untuk keperluan produksi; potensi kesalahan dan waktu administrasi perlu divalidasi melalui wawancara pengguna sebelum menjadi klaim empiris.

**Target Pengguna:** Produsen dan penjual sarana upacara Hindu Bali yang mengelola pesanan melalui pesan digital.

**Fitur Utama Sudah Berfungsi:** DIISI SETELAH online test. Jangan menyatakan analisis AI dan penyimpanan cloud sudah siap sampai diuji dengan credential asli.

**URL Website:** DIISI SETELAH DEPLOY.  
**Akun Demo:** DIISI SETELAH SIGN-UP DAN TEST. Jangan taruh password production.  
**URL GitHub:** DIISI SETELAH PUSH.  
**Repository Status:** Public atau Private sesuai faktanya.  
**Git Tag:** Buat `v1.0-submission` setelah final test, jangan hanya mengetik nama tag.

**Jenis AI:** Large Language Model / Generative AI; Natural Language Processing.  
**Model AI:** OpenAI Responses API; nama model sesuai `OPENAI_MODEL` aktual.  
**Peran AI:** Teks pesanan + katalog -> ekstraksi terstruktur nama produk/jumlah/tenggat/pertanyaan -> koreksi pengguna -> pesanan tervalidasi -> material planning deterministik.

**AI-assisted Development:** ChatGPT untuk desain, coding, dan dokumentasi. Tambahkan tools lainnya bila benar-benar digunakan.

**Third-party:** Netlify Functions, Supabase Auth / PostgreSQL, OpenAI API. Data awal sintetis, data uji perlu dikumpulkan dan dijelaskan sumbernya.

**Privasi:** Ketika fungsi online, data login Supabase dilindungi Auth dan RLS; endpoint AI memverifikasi user sebelum API call, API key tersimpan server. Chat disarankan dianonimkan dan penggunaan data pengguna harus memperoleh izin. Dokumentasikan hasil uji keamanan sebelum klaim keamanan final.

**Proposal PDF:** belum dibuat karena hasil deploy, screenshot, dan pengujian AI belum tersedia; ikuti pedoman 5 halaman isi + cover dan lampiran.
