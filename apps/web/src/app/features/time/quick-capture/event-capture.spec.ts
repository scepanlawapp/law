import { eventCaptureInput } from "./event-capture";
const event = {
  id: "e",
  title: "Meeting",
  description: null,
  clients: [],
  case: null,
  startsAt: "2026-10-01T09:00:00Z",
  endsAt: "2026-10-01T10:00:00Z",
  isAllDay: false,
};
describe("event capture performer", () => {
  it("uses the past-event performer", () =>
    expect(eventCaptureInput({ ...event, userId: "assigned" }).userId).toBe(
      "assigned",
    ));
  it("prefers the assignee over the organizer", () =>
    expect(
      eventCaptureInput({
        ...event,
        assigneeUsers: [
          { id: "assigned", displayName: "Ana", email: "a@test" },
        ],
        organizerUser: {
          id: "organizer",
          displayName: "Marko",
          email: "m@test",
        },
      }).userId,
    ).toBe("assigned"));
  it("falls back to the organizer", () =>
    expect(
      eventCaptureInput({
        ...event,
        organizerUser: {
          id: "organizer",
          displayName: "Marko",
          email: "m@test",
        },
      }).userId,
    ).toBe("organizer"));
});
