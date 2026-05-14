# Student Dashboard Activity Feed API Requirements

## Endpoint
- `GET /api/activity`

## Description
Returns a list of recent activity items for the authenticated student. Each item represents a user action (e.g., continued a class, completed a quiz, watched a video).

## Response Example
```
[
  {
    "type": "class_continue",
    "text": "You continued 'Quranic Arabic 101'",
    "icon": "book-open",
    "iconBg": "bg-[#e7f3ef]",
    "iconColor": "text-[#234946]",
    "time": "2026-05-06T10:00:00Z"
  },
  {
    "type": "quiz_complete",
    "text": "Quiz 'Surah Al-Fatiha' completed",
    "icon": "chart-line",
    "iconBg": "bg-[#fff0e7]",
    "iconColor": "text-[#c26d32]",
    "time": "2026-05-05T15:00:00Z"
  },
  {
    "type": "video_watch",
    "text": "Watched 'Short Reflection: Sincerity'",
    "icon": "film",
    "iconBg": "bg-[#ebf6ef]",
    "iconColor": "text-[#4f775c]",
    "time": "2026-05-04T18:00:00Z"
  }
]
```

## Notes
- The frontend expects an array of activity objects with `text`, `icon`, `iconBg`, `iconColor`, and `time` fields.
- The `icon` field should map to a known icon (e.g., `book-open`, `chart-line`, `film`).
- The `time` field should be an ISO string; the frontend will format it as needed.
- Authentication required (JWT or session).
- Extendable for more activity types.
