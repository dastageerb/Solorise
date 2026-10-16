import { NextResponse } from 'next/server';
import { adminDb, firebaseAdminConfigured, verifyBearer } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed.';
  if (message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (message === 'FORBIDDEN') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  if (message === 'Firebase Admin credentials are not configured.') return NextResponse.json({ error: message }, { status: 503 });
  console.error('Project deletion failed', error);
  return NextResponse.json({ error: 'The project could not be deleted.' }, { status: 500 });
}

export async function DELETE(request: Request, context: RouteContext<'/api/admin/projects/[projectId]'>) {
  try {
    if (!firebaseAdminConfigured) throw new Error('Firebase Admin credentials are not configured.');
    await verifyBearer(request, true);
    const { projectId } = await context.params;
    const projectRef = adminDb().doc(`projects/${projectId}`);
    const project = await projectRef.get();
    if (!project.exists) throw new Error('NOT_FOUND');

    await adminDb().recursiveDelete(projectRef);
    return NextResponse.json({ success: true, deletedProjectId: projectId });
  } catch (error) {
    return failure(error);
  }
}
