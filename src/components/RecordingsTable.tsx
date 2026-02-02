import React, { useEffect, useState } from "react";
import type { OwnerGroup, PageRecord } from "../hooks/useOwnerGroups";
import type { Recording, MeetingAnalyticsStats } from "../types";
import { formatBytes } from "../utils/recordingFormatters";

export type RecordingsTableProps = {
  ownerGroups: OwnerGroup[];
  isGroupCollapsed: (groupKey: string) => boolean;
  toggleGroupCollapse: (groupKey: string) => void;
  isGroupFullySelected: (group: OwnerGroup) => boolean;
  toggleGroupSelection: (group: OwnerGroup, checked: boolean) => void;
  makeRecordKey: (rec: Recording, idx: number) => string;
  toggleRowSelection: (rec: Recording, idx: number) => void;
  selectedKeys: Set<string>;
  selectAllOnPage: (checked: boolean) => void;
  allOnPageSelected: boolean;
  demoMode: boolean;

  analyticsByMeetingId?: Record<string, MeetingAnalyticsStats | undefined>;
};

const DownloadIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4.01 4.01a1.2 1.2 0 0 1-1.38.22a1.2 1.2 0 0 1-.22-.22L7.08 11.7a1 1 0 1 1 1.42-1.4L11 12.8V4a1 1 0 0 1 1-1ZM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"
    />
  </svg>
);

const slug = (s: string) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

const RecordingsTable: React.FC<RecordingsTableProps> = ({
  ownerGroups,
  isGroupCollapsed,
  toggleGroupCollapse,
  isGroupFullySelected,
  toggleGroupSelection,
  makeRecordKey,
  toggleRowSelection,
  selectedKeys,
  selectAllOnPage,
  allOnPageSelected,
  demoMode,
  analyticsByMeetingId,
}) => {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  useEffect(() => {
    const onDocClick = () => setOpenMenuKey(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuKey(null);
    };

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="table-wrapper">
      <table className="rec-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={(e) => selectAllOnPage(e.target.checked)}
              />
            </th>
            <th>Date / Time</th>
            <th>Topic</th>
            <th>Host</th>
            <th>Files</th>
            <th>Size</th>
            <th>Plays</th>
            <th>Downloads</th>
            <th>Last access</th>
            <th>Auto-delete date</th>
          </tr>
        </thead>

        <tbody>
          {ownerGroups.map((group) => {
            const groupSelected = isGroupFullySelected(group);
            const collapsed = isGroupCollapsed(group.key);

            const dateRangeLabel =
              group.firstDate && group.lastDate
                ? `${group.firstDate.toLocaleDateString()} → ${group.lastDate.toLocaleDateString()}`
                : "—";

            return (
              <React.Fragment key={group.key}>
                <tr className="rec-row group-row">
                  <td>
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      onChange={(e) => toggleGroupSelection(group, e.target.checked)}
                    />
                  </td>
                  <td colSpan={9}>
                    <button
                      type="button"
                      className="group-toggle"
                      onClick={() => toggleGroupCollapse(group.key)}
                    >
                      {collapsed ? "▶" : "▼"}
                    </button>
                    <strong>{group.ownerLabel}</strong>{" "}
                    <span style={{ opacity: 0.8 }}>
                      · {group.count} recording{group.count !== 1 ? "s" : ""} · Total size{" "}
                      {formatBytes(group.totalSizeBytes)} · {dateRangeLabel}
                    </span>
                  </td>
                </tr>

                {!collapsed &&
                  group.items.map(({ rec, globalIndex }: PageRecord) => {
                    const rowKey = makeRecordKey(rec, globalIndex);

                    const dt = rec.date_time
                      ? new Date(rec.date_time)
                      : rec.end_time
                      ? new Date(rec.end_time)
                      : null;

                    const dateDisplay = dt
                      ? dt.toLocaleString(undefined, {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—";

                    const topic = rec.topic || "Meeting";
                    const host = rec.host_email || rec.host_name || rec.owner?.name || "—";
                    const sizeDisplay = formatBytes(rec.file_size);

                    const meetingId = (rec as any).meetingId || "";
                    const stats = analyticsByMeetingId?.[meetingId];

                    const plays = stats?.plays;
                    const downloads = stats?.downloads;
                    const lastAccessDate = stats?.lastAccessDate ?? "";

                    const files = rec.recording_files ?? [];
                    const fileCount = rec.files_count ?? files.length;

                    const meetingFileLinks = (() => {
                      const seenTypes = new Set<string>();
                      const out: Array<{ label: string; href: string }> = [];

                      for (const f of files) {
                        const t = (f.file_type || "FILE").toUpperCase();
                        if (!f.download_url || seenTypes.has(t)) continue;
                        seenTypes.add(t);

                        const dtPart = f.recording_start
                          ? new Date(f.recording_start)
                              .toISOString()
                              .slice(0, 19)
                              .replace(/[:T]/g, "-")
                          : rec.date_time
                          ? new Date(rec.date_time)
                              .toISOString()
                              .slice(0, 19)
                              .replace(/[:T]/g, "-")
                          : "recording";

                        const ext = (f.file_extension || f.file_type || "").toLowerCase() || "dat";
                        const filename = `${slug(topic)}_${dtPart}.${ext}`;

                        const href =
                          `/api/meeting/recordings/download?url=${encodeURIComponent(f.download_url)}` +
                          `&filename=${encodeURIComponent(filename)}`;

                        out.push({ label: t, href });
                      }

                      return out;
                    })();

                    const filesCell =
                      fileCount && meetingFileLinks.length ? (
                        <div className="files-cell">
                          <span className="files-count">
                            {fileCount} file{fileCount !== 1 ? "s" : ""}
                          </span>

                          {!demoMode && (
                            <div className="download-menu-wrap" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label="Download files"
                                title="Download files"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuKey((k) => (k === rowKey ? null : rowKey));
                                }}
                              >
                                <DownloadIcon />
                              </button>

                              {openMenuKey === rowKey && (
                                <div className="download-menu" onClick={(e) => e.stopPropagation()}>
                                  <div className="download-menu-title">Download files</div>
                                  {meetingFileLinks.map((l) => (
                                    <a key={l.label} className="download-menu-item" href={l.href}>
                                      {l.label}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      );

                    const autoDeleteDate =
                      (rec as any).autoDeleteDate ?? (rec as any).auto_delete_date ?? "";

                    return (
                      <tr key={rowKey} className="rec-row">
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(rowKey)}
                            onChange={() => toggleRowSelection(rec, globalIndex)}
                          />
                        </td>

                        <td>{dateDisplay}</td>
                        <td>{topic}</td>
                        <td>{host}</td>
                        <td>{filesCell}</td>
                        <td>{sizeDisplay}</td>

                        <td>{plays ?? "—"}</td>
                        <td>{downloads ?? "—"}</td>
                        <td>{lastAccessDate || "—"}</td>

                        <td>{autoDeleteDate || ""}</td>
                      </tr>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default RecordingsTable;
