const DAILY_API_KEY = process.env.DAILY_API_KEY!;
const DAILY_BASE = "https://api.daily.co/v1";

async function dailyFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${DAILY_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Daily API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function createRoom(name: string) {
  const data = await dailyFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        start_audio_off: true,
        start_video_off: true,
        enable_people_ui: false,
        enable_pip_ui: false,
        enable_prejoin_ui: false,
        enable_chat: true,
        // No-recording policy (build spec): recording off, explicitly.
        // NOTE: "enable_recording_ui" is NOT a valid Daily property (room
        // API rejects it — verified live); with recording disabled Daily
        // renders no Record button at all.
        enable_recording: false,
      },
    }),
  });
  return {
    name: data.name as string,
    url: data.url as string,
  };
}

export async function getRoom(name: string) {
  const data = await dailyFetch(`/rooms/${name}`);
  return {
    name: data.name as string,
    url: data.url as string,
  };
}

export async function createMeetingToken(params: {
  roomName: string;
  userId: string;
  userName: string;
  expUnix: number;
}) {
  const { roomName, userId, userName, expUnix } = params;
  const data = await dailyFetch("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_id: userId,
        user_name: userName,
        exp: expUnix,
      },
    }),
  });
  return {
    token: data.token as string,
  };
}
