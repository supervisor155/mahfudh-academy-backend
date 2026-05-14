const axios = require('axios');
const db = require('../../db');

const QURAN_API = 'https://api.alquran.cloud/v1';

let schemaReadyPromise;

const ensureSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS quran_surahs (
          number SMALLINT PRIMARY KEY CHECK (number BETWEEN 1 AND 114),
          name VARCHAR(255) NOT NULL,
          english_name VARCHAR(255) NOT NULL,
          english_name_translation VARCHAR(255),
          revelation_type VARCHAR(32),
          number_of_ayahs SMALLINT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS quran_ayahs (
          id BIGSERIAL PRIMARY KEY,
          global_number INTEGER UNIQUE,
          surah_number SMALLINT NOT NULL REFERENCES quran_surahs(number) ON DELETE CASCADE,
          ayah_number SMALLINT NOT NULL,
          text TEXT NOT NULL,
          page SMALLINT,
          juz SMALLINT,
          hizb_quarter SMALLINT,
          sajdah BOOLEAN DEFAULT FALSE,
          bismillah BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(surah_number, ayah_number)
        )
      `);

      await db.query('CREATE INDEX IF NOT EXISTS idx_quran_ayahs_surah_number ON quran_ayahs(surah_number, ayah_number)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_quran_ayahs_page ON quran_ayahs(page, surah_number, ayah_number)');
    })();
  }

  return schemaReadyPromise;
};

const mapSurahRow = (row) => ({
  number: row.number,
  name: row.name,
  englishName: row.english_name,
  englishNameTranslation: row.english_name_translation,
  numberOfAyahs: row.number_of_ayahs,
  revelationType: row.revelation_type,
});

const mapAyahRow = (row) => ({
  number: row.ayah_number,
  text: row.text,
  page: row.page,
  juz: row.juz,
  hizbQuarter: row.hizb_quarter,
  sajdah: row.sajdah,
  bismillah: row.bismillah,
  surahNumber: row.surah_number,
  surahName: row.surah_name,
  surahNameEng: row.english_name,
  textEng: '',
  isCurrentSurah: true,
});

const upsertSurahs = async (surahs) => {
  for (const surah of surahs) {
    await db.query(
      `
        INSERT INTO quran_surahs (
          number,
          name,
          english_name,
          english_name_translation,
          revelation_type,
          number_of_ayahs,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (number) DO UPDATE SET
          name = EXCLUDED.name,
          english_name = EXCLUDED.english_name,
          english_name_translation = EXCLUDED.english_name_translation,
          revelation_type = EXCLUDED.revelation_type,
          number_of_ayahs = EXCLUDED.number_of_ayahs,
          updated_at = NOW()
      `,
      [
        surah.number,
        surah.name,
        surah.englishName,
        surah.englishNameTranslation || null,
        surah.revelationType || surah.revelationType || surah.revelation_type || null,
        surah.numberOfAyahs,
      ]
    );
  }
};

const upsertAyahs = async (ayahs) => {
  for (const ayah of ayahs) {
    const sajdah = typeof ayah.sajdah === 'object' ? Boolean(ayah.sajdah) : Boolean(ayah.sajdah);
    await db.query(
      `
        INSERT INTO quran_ayahs (
          global_number,
          surah_number,
          ayah_number,
          text,
          page,
          juz,
          hizb_quarter,
          sajdah,
          bismillah,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (surah_number, ayah_number) DO UPDATE SET
          global_number = EXCLUDED.global_number,
          text = EXCLUDED.text,
          page = EXCLUDED.page,
          juz = EXCLUDED.juz,
          hizb_quarter = EXCLUDED.hizb_quarter,
          sajdah = EXCLUDED.sajdah,
          bismillah = EXCLUDED.bismillah,
          updated_at = NOW()
      `,
      [
        ayah.number || null,
        ayah.surah?.number || ayah.surahNumber,
        ayah.numberInSurah || ayah.number,
        ayah.text,
        ayah.page || null,
        ayah.juz || null,
        ayah.hizbQuarter || null,
        sajdah,
        Boolean(ayah.bismillah),
      ]
    );
  }
};

const importSurahsIfNeeded = async () => {
  await ensureSchema();
  const existing = await db.query('SELECT COUNT(*)::int AS count FROM quran_surahs');

  if (existing.rows[0].count > 0) {
    return;
  }

  const response = await axios.get(`${QURAN_API}/surah`);
  await upsertSurahs(response.data.data || []);
};

const importSurahAyahs = async (surahNumber) => {
  await importSurahsIfNeeded();
  const response = await axios.get(`${QURAN_API}/surah/${surahNumber}?offset=0&limit=300`);
  const surahData = response.data.data;

  await upsertSurahs([
    {
      number: surahData.number,
      name: surahData.name,
      englishName: surahData.englishName,
      englishNameTranslation: surahData.englishNameTranslation,
      revelationType: surahData.revelationType,
      numberOfAyahs: surahData.numberOfAyahs,
    },
  ]);
  await upsertAyahs((surahData.ayahs || []).map((ayah) => ({ ...ayah, surah: { number: surahData.number } })));
};

const importPageAyahs = async (pageNumber) => {
  await importSurahsIfNeeded();
  const response = await axios.get(`${QURAN_API}/page/${pageNumber}/quran-uthmani`);
  const ayahs = response.data.data?.ayahs || [];
  const surahMap = new Map();

  ayahs.forEach((ayah) => {
    if (ayah.surah) {
      surahMap.set(ayah.surah.number, {
        number: ayah.surah.number,
        name: ayah.surah.name,
        englishName: ayah.surah.englishName,
        englishNameTranslation: ayah.surah.englishNameTranslation,
        revelationType: ayah.surah.revelationType,
        numberOfAyahs: ayah.surah.numberOfAyahs,
      });
    }
  });

  await upsertSurahs([...surahMap.values()]);
  await upsertAyahs(ayahs);
};

exports.getSurahs = async () => {
  await importSurahsIfNeeded();
  const result = await db.query('SELECT * FROM quran_surahs ORDER BY number ASC');
  return result.rows.map(mapSurahRow);
};

exports.getSurahByNumber = async (surahNumber) => {
  await importSurahsIfNeeded();
  const existingAyahs = await db.query(
    'SELECT COUNT(*)::int AS count FROM quran_ayahs WHERE surah_number = $1',
    [surahNumber]
  );

  if (existingAyahs.rows[0].count === 0) {
    await importSurahAyahs(surahNumber);
  }

  const surahResult = await db.query('SELECT * FROM quran_surahs WHERE number = $1', [surahNumber]);
  if (surahResult.rows.length === 0) {
    return null;
  }

  const ayahResult = await db.query(
    `
      SELECT qa.*, qs.name AS surah_name, qs.english_name
      FROM quran_ayahs qa
      JOIN quran_surahs qs ON qs.number = qa.surah_number
      WHERE qa.surah_number = $1
      ORDER BY qa.ayah_number ASC
    `,
    [surahNumber]
  );

  const surah = mapSurahRow(surahResult.rows[0]);
  return {
    ...surah,
    ayahs: ayahResult.rows.map(mapAyahRow),
  };
};

exports.getPageByNumber = async (pageNumber) => {
  await importSurahsIfNeeded();
  const existingAyahs = await db.query(
    'SELECT COUNT(*)::int AS count FROM quran_ayahs WHERE page = $1',
    [pageNumber]
  );

  if (existingAyahs.rows[0].count === 0) {
    await importPageAyahs(pageNumber);
  }

  const result = await db.query(
    `
      SELECT qa.*, qs.name AS surah_name, qs.english_name
      FROM quran_ayahs qa
      JOIN quran_surahs qs ON qs.number = qa.surah_number
      WHERE qa.page = $1
      ORDER BY qa.surah_number ASC, qa.ayah_number ASC
    `,
    [pageNumber]
  );

  return {
    pageNumber,
    ayahs: result.rows.map((row) => ({
      ...mapAyahRow(row),
      isCurrentSurah: row.surah_number === row.surah_number,
    })),
  };
};

exports.getAyahAudio = async (surahNumber, ayahNumber, reciter) => {
  const response = await axios.get(`${QURAN_API}/ayah/${surahNumber}:${ayahNumber}/${reciter}`);
  return { audio: response.data?.data?.audio || '' };
};