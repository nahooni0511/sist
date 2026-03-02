type Props = {
  status: string;
  kind?: "device" | "command";
};

export default function StatusBadge({ status, kind = "device" }: Props) {
  const normalized = status.toLowerCase();

  let className = "badge neutral";
  if (normalized === "online" || normalized === "success") {
    className = "badge success";
  }
  if (normalized === "offline" || normalized === "failed") {
    className = "badge danger";
  }
  if (normalized === "running" || normalized === "pending") {
    className = "badge warn";
  }

  return <span className={className}>{kind === "command" ? status.toUpperCase() : status}</span>;
}
