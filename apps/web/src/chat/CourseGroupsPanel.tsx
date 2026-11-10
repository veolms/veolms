import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatRoomSummary } from "@veolms/contracts";
import { useRef, useState } from "react";

import { getApiError } from "../lib/api-error";
import { fuzzyMatches } from "../lib/fuzzySearch";
import { cn } from "../lib/utils";
import { chatKeys, chatService } from "../services/chat";
import type { ChatRoomList } from "../services/chat/chat.service";
import { useMyCourses } from "../services/courses";
import { ChatToggle, ListPanelHeader } from "./ChatControls";
import { ChatListSkeleton } from "./ChatSkeletons";

/**
 * Staff: a group per course, like adding groups to a WhatsApp community.
 * The switch turns a course's group on (everyone enrolled gets it in Chats
 * at once) or off (archived: hidden from learners, history kept, and in the
 * staff's Archived chats). Tapping a course whose group is on opens it.
 */
export function CourseGroupsPanel({
  rooms,
  onBack,
  onOpen,
  onToast,
}: {
  rooms: ChatRoomSummary[];
  onBack: () => void;
  onOpen: (roomId: string) => void;
  onToast: (message: string) => void;
}) {
  const client = useQueryClient();
  const courses = useMyCourses();
  const [search, setSearch] = useState("");
  // Switches moved but not answered yet: course id -> on/off.
  const [turning, setTurning] = useState<Record<string, boolean>>({});
  const inflight = useRef(new Set<string>());
  const isOn = (courseId: string) =>
    turning[courseId] ?? byCourse.get(courseId)?.status === "active";
  const byCourse = new Map(
    rooms.filter((r) => r.courseId).map((r) => [r.courseId!, r]),
  );
  const term = search.trim();
  const list = (courses.data?.courses ?? [])
    .filter((course) => course.status !== "archived")
    .filter((course) => !term || fuzzyMatches(term, course.title));
  const on = list.filter((course) => isOn(course.id));
  const off = list.filter((course) => !isOn(course.id));

  // The switch moves at once; the server is asked in the background and
  // the switch goes back only if it says no. Turning a group on doesn't
  // open it: tap the course (or find it in Chats) to go in.
  function setRoomStatus(roomId: string, status: ChatRoomSummary["status"]) {
    client.setQueryData<ChatRoomList>(chatKeys.rooms(), (old) =>
      old
        ? {
            ...old,
            rooms: old.rooms.map((r) =>
              r.id === roomId ? { ...r, status } : r,
            ),
          }
        : old,
    );
  }

  async function turnOn(courseId: string, room: ChatRoomSummary | undefined) {
    if (inflight.current.has(courseId)) return;
    inflight.current.add(courseId);
    setTurning((all) => ({ ...all, [courseId]: true }));
    await client.cancelQueries({ queryKey: chatKeys.rooms() });
    if (room) setRoomStatus(room.id, "active");
    try {
      const { room: created } = await chatService.enableCourseChat(courseId);
      client.setQueryData<ChatRoomList>(chatKeys.rooms(), (old) =>
        old
          ? {
              ...old,
              rooms: old.rooms.some((r) => r.id === created.id)
                ? old.rooms.map((r) => (r.id === created.id ? created : r))
                : [created, ...old.rooms],
            }
          : old,
      );
      client.setQueryData(chatKeys.room(created.id), created);
      onToast("Group turned on. Everyone enrolled can see it now.");
    } catch (error) {
      if (room) setRoomStatus(room.id, room.status);
      onToast(getApiError(error).message);
    } finally {
      inflight.current.delete(courseId);
      setTurning(({ [courseId]: _done, ...rest }) => rest);
      void client.invalidateQueries({ queryKey: chatKeys.rooms() });
    }
  }

  async function turnOff(courseId: string, room: ChatRoomSummary) {
    if (inflight.current.has(courseId)) return;
    inflight.current.add(courseId);
    setTurning((all) => ({ ...all, [courseId]: false }));
    await client.cancelQueries({ queryKey: chatKeys.rooms() });
    setRoomStatus(room.id, "archived");
    try {
      await chatService.updateSettings(room.id, { status: "archived" });
      onToast("Group turned off. It's in Archived; its messages are kept.");
    } catch (error) {
      setRoomStatus(room.id, room.status);
      onToast(getApiError(error).message);
    } finally {
      inflight.current.delete(courseId);
      setTurning(({ [courseId]: _done, ...rest }) => rest);
      void client.invalidateQueries({ queryKey: chatKeys.rooms() });
      void client.invalidateQueries({ queryKey: chatKeys.room(room.id) });
    }
  }

  const row = (course: (typeof list)[number]) => {
    const room = byCourse.get(course.id);
    const active = isOn(course.id);
    const thumb = course.thumbnailSrcSet?.[0]?.url ?? course.thumbnailUrl;
    return (
      <li key={course.id} className="group/row relative">
        <button
          type="button"
          disabled={!active}
          onClick={() => room && room.status === "active" && onOpen(room.id)}
          className={cn(
            "flex w-full items-center gap-3.5 rounded-xl border-0 bg-transparent py-2.5 pr-18 pl-3 text-left text-(--text)",
            active
              ? "cursor-pointer hover:bg-(--chat-hover)"
              : "cursor-default",
          )}
        >
          <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,var(--chat-input))] text-(--accent-ink)">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <UsersThree size={22} weight="fill" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.95rem]">
              {course.title}
            </span>
            <span className="block truncate text-[0.8rem] text-(--muted)">
              {active
                ? room?.lastMessage
                  ? `Group on · ${room.lastMessage.preview || "Media"}`
                  : "Group on · no messages yet"
                : room
                  ? "Group off · messages kept"
                  : course.status === "published"
                    ? "No group yet"
                    : "No group yet · course not published"}
            </span>
          </span>
        </button>
        <span className="absolute top-1/2 right-4 -translate-y-1/2">
          <ChatToggle
            checked={active}
            label={`${active ? "Turn off" : "Turn on"} the group for ${course.title}`}
            onChange={(next) =>
              next
                ? void turnOn(course.id, room)
                : room && void turnOff(course.id, room)
            }
          />
        </span>
      </li>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListPanelHeader title="Course groups" onBack={onBack} />
      <p className="m-0 mx-4 mb-3 rounded-xl bg-(--chat-input) px-4 py-3 text-[0.82rem] leading-snug text-(--text-secondary)">
        Each course can have one group. Everyone enrolled sees it in Chats. Free
        courses start with only admins sending; change that in the group’s info.
      </p>
      <label className="mx-3 mb-2 flex h-10 shrink-0 items-center gap-3 rounded-full bg-(--chat-input) px-4">
        <MagnifyingGlass
          size={17}
          className="text-(--muted)"
          aria-hidden="true"
        />
        <span className="sr-only">Search courses</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search courses"
          className="min-w-0 flex-1 border-0 bg-transparent text-[0.9rem] text-(--text) outline-none placeholder:text-(--muted)"
          onKeyDown={(event) => event.key === "Escape" && onBack()}
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {courses.isLoading ? <ChatListSkeleton /> : null}
        {on.length > 0 ? (
          <>
            <h3 className="m-0 px-3 pt-3 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
              Groups on · {on.length}
            </h3>
            <ul className="m-0 list-none p-0">{on.map(row)}</ul>
          </>
        ) : null}
        {off.length > 0 ? (
          <>
            <h3 className="m-0 px-3 pt-4 pb-1 text-[0.8rem] font-semibold text-(--muted)">
              Turn on a group
            </h3>
            <ul className="m-0 list-none p-0">{off.map(row)}</ul>
          </>
        ) : null}
        {courses.data && list.length === 0 ? (
          <p className="m-0 px-6 py-10 text-center text-[0.86rem] text-(--muted)">
            {term ? "No course matches." : "You don’t run any course yet."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
