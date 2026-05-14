// This would normally query the DB. For now, return static data.
exports.getRecentActivity = async (userId) => {
  // TODO: Replace with real DB query
  return [
    {
      type: 'class_continue',
      text: "You continued 'Quranic Arabic 101'",
      icon: 'book-open',
      iconBg: 'bg-[#e7f3ef]',
      iconColor: 'text-[#234946]',
      time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      type: 'quiz_complete',
      text: "Quiz 'Surah Al-Fatiha' completed",
      icon: 'chart-line',
      iconBg: 'bg-[#fff0e7]',
      iconColor: 'text-[#c26d32]',
      time: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    },
    {
      type: 'video_watch',
      text: "Watched 'Short Reflection: Sincerity'",
      icon: 'film',
      iconBg: 'bg-[#ebf6ef]',
      iconColor: 'text-[#4f775c]',
      time: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    },
  ];
};
