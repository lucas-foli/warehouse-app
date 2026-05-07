// src/components/members/MembersPage.tsx
import { useEffect, useState } from "react";
import { useTenant } from "../../context/TenantContext";
import {
  listInvitations, listMembers,
  type TenantInvitation, type TenantMember,
} from "../../services/invitations";
import InviteMemberModal from "./InviteMemberModal";
import InvitationsList from "./InvitationsList";
import MembersList from "./MembersList";

interface Props { canInvite: boolean; }

const MembersPage = ({ canInvite }: Props) => {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([listMembers(tenantId), listInvitations(tenantId)]);
      setMembers(m);
      setInvitations(i);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [tenantId]);

  if (!tenantId) return null;

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Members</h1>
        {canInvite && (
          <button onClick={() => setShowInvite(true)}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Invite teammate
          </button>
        )}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <MembersList members={members} />
          {canInvite && <InvitationsList invitations={invitations} onChanged={load} />}
        </>
      )}

      {showInvite && (
        <InviteMemberModal
          tenantId={tenantId}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); void load(); }} />
      )}
    </div>
  );
};

export default MembersPage;
