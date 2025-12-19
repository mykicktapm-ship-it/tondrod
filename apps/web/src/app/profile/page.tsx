'use client';

import SeedVault from '../../components/SeedVault';

export default function ProfilePage() {
  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Profile</h2>
      <p className="mb-4 text-sm">Manage your local commit-reveal secrets.</p>
      <SeedVault />
    </div>
  );
}
