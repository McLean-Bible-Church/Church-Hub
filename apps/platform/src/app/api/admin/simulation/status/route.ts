import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@church/nextjs-auth';
import { getContactById, parseFilterId } from '@church/ministry-platform';

/**
 * GET /api/admin/simulation/status
 *
 * Get the current simulation status.
 * Returns info about impersonated user if active.
 */
export async function GET() {
  try {
    const session = await auth();

    // Check if user is an administrator OR is currently in simulation mode
    const isAdmin = session?.isAdmin;
    const isSimulating = session?.simulation != null;

    if (!session?.email || (!isAdmin && !isSimulating)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const cookieStore = await cookies();
    const simulationCookie = cookieStore.get('admin-simulation');

    if (!simulationCookie) {
      return NextResponse.json({ active: false });
    }

    let simulation;
    try {
      simulation = JSON.parse(simulationCookie.value);
    } catch {
      return NextResponse.json({ active: false });
    }

    // If impersonating, fetch the user details
    if (simulation?.type === 'impersonate') {
      const impersonatedContactId = parseFilterId(simulation.contactId);
      if (impersonatedContactId === null) {
        return NextResponse.json({ active: false });
      }

      const contact = await getContactById(impersonatedContactId, parseInt(session.userId, 10));

      if (contact) {
        return NextResponse.json({
          active: true,
          type: 'impersonate',
          user: {
            Contact_ID: contact.Contact_ID,
            Display_Name: contact.Display_Name,
            Email_Address: contact.Email_Address,
            Nickname: contact.Nickname,
            First_Name: contact.First_Name,
            Last_Name: contact.Last_Name,
            Image_GUID: contact.dp_fileUniqueId,
          },
        });
      }
    }

    // If simulating roles
    if (simulation?.type === 'roles') {
      return NextResponse.json({
        active: true,
        type: 'roles',
        roles: simulation.roles,
      });
    }

    return NextResponse.json({ active: false });
  } catch (error) {
    console.error('Error getting simulation status:', error);
    return NextResponse.json({ error: 'Failed to get simulation status' }, { status: 500 });
  }
}
