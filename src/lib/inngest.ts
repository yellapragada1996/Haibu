import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "haibu",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
