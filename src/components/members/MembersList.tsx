// src/components/members/MembersList.tsx
import type { TenantMember } from "../../services/invitations";

const MembersList = ({ members }: { members: TenantMember[] }) => {
  if (members.length === 0) return <p className="text-sm text-muted-foreground">No members yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        <tr>
          <th className="py-2">Email</th>
          <th>Role</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {members.map((m) => (
          <tr key={m.user_id}>
            <td className="py-3">{m.email ?? <span className="text-muted-foreground">—</span>}</td>
            <td>{m.role}</td>
            <td className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default MembersList;
