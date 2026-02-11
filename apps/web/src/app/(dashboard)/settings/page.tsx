'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Modal } from '@/components/ui/modal';
import { ORG_ROLES } from '@dxer/shared';
import { UserPlus, Building2, Users, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { currentOrg, user, refreshUser } = useAuth();
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (currentOrg) loadOrgDetails(); }, [currentOrg]);

  async function loadOrgDetails() {
    try { const res = await api.orgs.current(); setOrgDetails(res.data); } catch (err) { console.error(err); }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setError('');
    try { await api.orgs.invite({ email: inviteEmail, role: inviteRole }); setShowInvite(false); setInviteEmail(''); loadOrgDetails(); }
    catch (err: any) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setError('');
    try { await api.orgs.create({ name: newOrgName, slug: newOrgSlug }); setShowCreateOrg(false); setNewOrgName(''); setNewOrgSlug(''); await refreshUser(); }
    catch (err: any) { setError(err.message); } finally { setSubmitting(false); }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your organization and account" />

      <div className="space-y-6 max-w-3xl">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Building2 className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-serif text-gray-900">Organization</h2>
          </div>
          {orgDetails ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Name</span><span className="font-medium text-gray-800">{orgDetails.name}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Slug</span><code className="bg-surface-100 px-2 py-0.5 rounded text-xs text-gray-600">{orgDetails.slug}</code></div>
              <div className="flex justify-between"><span className="text-gray-400">Your Role</span><span className="capitalize font-medium text-gray-800">{currentOrg?.role}</span></div>
            </div>
          ) : ( <p className="text-sm text-gray-400">Loading...</p> )}
          <div className="mt-4">
            <button onClick={() => setShowCreateOrg(true)} className="btn-secondary text-sm">
              <Building2 className="mr-2 h-4 w-4" /> Create New Organization
            </button>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-purple-400" />
              <h2 className="text-lg font-serif text-gray-900">Members</h2>
            </div>
            {(currentOrg?.role === 'owner' || currentOrg?.role === 'admin') && (
              <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
                <UserPlus className="mr-2 h-4 w-4" /> Invite
              </button>
            )}
          </div>
          {orgDetails?.members ? (
            <div className="divide-y divide-gray-100">
              {orgDetails.members.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{member.fullName}</p>
                    <p className="text-xs text-gray-400">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-purple-300" />
                    <span className="text-sm capitalize text-gray-500">{member.role}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : ( <p className="text-sm text-gray-400">Loading members...</p> )}
        </div>
      </div>

      <Modal isOpen={showInvite} onClose={() => setShowInvite(false)} title="Invite Member" size="sm">
        <form onSubmit={handleInvite} className="space-y-4">
          {error && <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">{error}</div>}
          <div><label className="label">Email *</label><input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="input-field mt-1" required /></div>
          <div><label className="label">Role *</label><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input-field mt-1">{ORG_ROLES.filter((r) => r !== 'owner').map((r) => (<option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>))}</select></div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Inviting...' : 'Send Invite'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showCreateOrg} onClose={() => setShowCreateOrg(false)} title="Create Organization" size="sm">
        <form onSubmit={handleCreateOrg} className="space-y-4">
          {error && <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">{error}</div>}
          <div><label className="label">Organization Name *</label><input value={newOrgName} onChange={(e) => { setNewOrgName(e.target.value); setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')); }} className="input-field mt-1" required /></div>
          <div><label className="label">Slug *</label><input value={newOrgSlug} onChange={(e) => setNewOrgSlug(e.target.value)} className="input-field mt-1" pattern="[a-z0-9-]+" required /><p className="mt-1 text-xs text-gray-300">Lowercase letters, numbers, and hyphens only</p></div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreateOrg(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
