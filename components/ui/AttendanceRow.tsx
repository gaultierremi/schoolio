/**
 * // Liste simple :
 * // <AttendanceRow
 * //   studentName="Marie Dupont"
 * //   studentId="abc-123"
 * //   status="present"
 * //   onChange={(s) => updateAttendance("abc-123", s)}
 * // />
 *
 * // Variant compact :
 * // <AttendanceRow
 * //   studentName="Pierre M."
 * //   studentId="def-456"
 * //   status="late"
 * //   onChange={handleChange}
 * //   size="compact"
 * // />
 *
 * // Avec avatar :
 * // <AttendanceRow
 * //   studentName="Sophie K."
 * //   studentId="ghi-789"
 * //   status="absent"
 * //   avatar="https://example.com/avatar.jpg"
 * //   onChange={handleChange}
 * // />
 */
export type AttendanceStatus = "present" | "absent" | "late";

export type AttendanceRowProps = {
  studentName: string;
  studentId: string;
  status: AttendanceStatus;
  onChange: (newStatus: AttendanceStatus) => void;
  avatar?: string | null;
  size?: "compact" | "comfortable";
  disabled?: boolean;
  className?: string;
};

type AttendanceRowSize = NonNullable<AttendanceRowProps["size"]>;

type StatusOption = {
  status: AttendanceStatus;
  label: string;
  ariaStatus: string;
  icon: string;
  activeClasses: string;
};

const statusOptions: StatusOption[] = [
  {
    status: "present",
    label: "Présent",
    ariaStatus: "présent",
    icon: "✓",
    activeClasses: "border-green-500/40 bg-green-500/20 text-green-400",
  },
  {
    status: "absent",
    label: "Absent",
    ariaStatus: "absent",
    icon: "✗",
    activeClasses: "border-red-500/40 bg-red-500/20 text-red-400",
  },
  {
    status: "late",
    label: "Retard",
    ariaStatus: "en retard",
    icon: "⏰",
    activeClasses: "border-amber-500/40 bg-amber-500/20 text-amber-400",
  },
];

const rowSizeClasses: Record<AttendanceRowSize, string> = {
  compact: "gap-2 px-2 py-1.5",
  comfortable: "gap-3 px-3 py-2",
};

const avatarSizeClasses: Record<AttendanceRowSize, string> = {
  compact: "h-6 w-6 text-xs",
  comfortable: "h-8 w-8 text-sm",
};

const pillSizeClasses: Record<AttendanceRowSize, string> = {
  compact: "min-h-11 px-2 py-0.5 text-xs sm:min-h-8",
  comfortable: "min-h-11 px-3 py-1.5 text-sm",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getInitials(studentName: string) {
  const words = studentName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function AttendanceRow({
  studentName,
  studentId,
  status,
  onChange,
  avatar,
  size = "comfortable",
  disabled = false,
  className,
}: AttendanceRowProps) {
  const initials = getInitials(studentName);

  return (
    <div
      className={cx(
        "flex w-full items-center rounded-lg transition-opacity",
        rowSizeClasses[size],
        disabled && "opacity-50",
        className,
      )}
      data-student-id={studentId}
    >
      {avatar ? (
        <img
          alt=""
          className={cx(
            "shrink-0 rounded-full object-cover",
            avatarSizeClasses[size],
          )}
          src={avatar}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-purple-500/20 font-bold text-purple-200",
            avatarSizeClasses[size],
          )}
        >
          {initials}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate font-medium text-white">
        {studentName}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {statusOptions.map((option) => {
          const isActive = status === option.status;

          return (
            <button
              aria-label={`Marquer ${studentName} comme ${option.ariaStatus}`}
              aria-pressed={isActive}
              className={cx(
                "inline-flex items-center justify-center gap-1 rounded-md border font-medium leading-none transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
                pillSizeClasses[size],
                isActive
                  ? option.activeClasses
                  : "border-gray-700 bg-transparent text-gray-500 hover:border-gray-600 hover:text-gray-300",
                disabled && "cursor-not-allowed hover:border-gray-700 hover:text-gray-500",
              )}
              disabled={disabled}
              key={option.status}
              onClick={() => onChange(option.status)}
              type="button"
            >
              <span aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AttendanceRow;
