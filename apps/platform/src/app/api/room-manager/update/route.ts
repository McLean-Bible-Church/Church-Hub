import { NextRequest, NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { parseRoomManagerAction } from '@/lib/validation/roomManager';
import {
  closeAllGroupsInRoom,
  updateEventRoom,
  updateEventParticipant,
  closeEventRooms,
  openEventRooms,
} from '@/services/roomManagerService';

export async function POST(request: NextRequest) {
  try {
    // Every action writes Event_Rooms / Event_Participants (check-in data)
    const access = await requireApiAppAccess('room-manager', 'edit');
    if (!access.ok) return access.response;

    const userId = access.userId!;

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      // fall through to validation error
    }

    const action = parseRoomManagerAction(body);
    if (!action) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    switch (action.type) {
      case 'closeAll':
        await closeAllGroupsInRoom(action.eventRoomIds, userId);
        break;

      case 'toggleClosed':
        await updateEventRoom(action.eventRoomId, { Closed: action.closed }, userId);
        break;

      case 'toggleAutoClose':
        await updateEventRoom(
          action.eventRoomId,
          { Auto_Close_At_Capacity: action.autoClose },
          userId
        );
        break;

      case 'setCheckInCapacity':
        await updateEventRoom(action.eventRoomId, { Check_In_Capacity: action.capacity }, userId);
        break;

      case 'setBalancePriority':
        await updateEventRoom(action.eventRoomId, { Balance_Priority: action.priority }, userId);
        break;

      case 'checkOut':
        await updateEventParticipant(
          action.eventParticipantId,
          { Time_Out: new Date().toISOString() },
          userId
        );
        break;

      case 'checkIn':
        await updateEventParticipant(action.eventParticipantId, { Time_Out: null }, userId);
        break;

      case 'changeRoom':
        await updateEventParticipant(
          action.eventParticipantId,
          { Room_ID: action.newRoomId },
          userId
        );
        break;

      case 'closeRoom':
        await closeEventRooms(action.eventRoomIds, userId);
        break;

      case 'openRoom':
        await openEventRooms(action.eventRoomIds, userId);
        break;

      case 'moveGroup':
        await updateEventRoom(action.eventRoomId, { Room_ID: action.newRoomId }, userId);
        break;

      default:
        return NextResponse.json({ error: 'Unknown action type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error executing room manager action:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: 'Failed to execute action' }, { status: 500 });
  }
}
