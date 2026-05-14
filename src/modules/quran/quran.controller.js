const svc = require('./quran.service');

exports.getSurahs = async (_req, res) => {
  try {
    const surahs = await svc.getSurahs();
    res.json({ data: surahs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSurahByNumber = async (req, res) => {
  try {
    const surahNumber = Number(req.params.surahNumber);
    const surah = await svc.getSurahByNumber(surahNumber);

    if (!surah) {
      return res.status(404).json({ message: 'Surah not found' });
    }

    res.json({ data: surah });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPageByNumber = async (req, res) => {
  try {
    const pageNumber = Number(req.params.pageNumber);
    const page = await svc.getPageByNumber(pageNumber);

    if (!page) {
      return res.status(404).json({ message: 'Page not found' });
    }

    res.json({ data: page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAyahAudio = async (req, res) => {
  try {
    const surahNumber = Number(req.params.surahNumber);
    const ayahNumber = Number(req.params.ayahNumber);
    const reciter = req.query.reciter || 'ar.alafasy';
    const audio = await svc.getAyahAudio(surahNumber, ayahNumber, reciter);
    res.json({ data: audio });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};