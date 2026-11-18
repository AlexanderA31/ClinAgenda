'use client';

import { useSession } from '@/lib/session';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { ChangePasswordForm } from '@/components/forms/change-password-form';

export default function AccountPage() {
  const user = useSession();
  return (
    <>
      <PageHeader title="Mi cuenta" description={`${user.fullName} · ${user.roleName} · usuario ${user.username}`} />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </>
  );
}
