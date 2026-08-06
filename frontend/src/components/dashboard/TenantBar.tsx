import type { TenantProfile } from "../../types";
import { Dropdown } from "../Dropdown";

interface TenantBarProps {
  profiles: TenantProfile[];
  currentTenant: string;
  onChange: (tenantId: string) => void;
}

export function TenantBar({ profiles, currentTenant, onChange }: TenantBarProps) {
  const profile = profiles.find((p) => p.id === currentTenant);

  const options = [
    { value: "", label: "All tools (no customer story)" },
    ...profiles.map((p) => ({ value: p.id, label: `${p.name} (${p.industry})` })),
  ];

  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Dropdown value={currentTenant} onChange={onChange} options={options} />
      </div>
      {profile && (
        <div className="animate-view-fade rounded-xl border border-accent/30 bg-accent-light p-3.5 px-4.5">
          <div className="text-[15px] font-extrabold text-accent">{profile.name}</div>
          <div className="my-0.5 text-[11.5px] text-muted">
            {profile.industry} · {profile.employee_count} employees · Primary framework:{" "}
            {profile.primary_framework}
          </div>
          <div className="mb-1.5 text-[12.5px] italic text-text">{profile.tagline}</div>
          <div className="text-[12.5px] leading-relaxed text-muted">{profile.story}</div>
        </div>
      )}
    </div>
  );
}
