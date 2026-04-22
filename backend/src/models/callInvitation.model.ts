import db from '../config/database';

export type CallInvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'missed' | 'failed';

export interface CallInvitationRecord {
  id: number;
  invitation_id: string;
  call_session_id: string;
  caller_name: string;
  callee_name: string;
  call_type: 'audio' | 'video';
  status: CallInvitationStatus;
  created_at: string;
  responded_at: string | null;
}

export class CallInvitationModel {
  static create(payload: {
    invitationId: string;
    callSessionId: string;
    callerName: string;
    calleeName: string;
    callType: 'audio' | 'video';
  }): void {
    db.prepare(
      `INSERT INTO call_invitations (
        invitation_id,
        call_session_id,
        caller_name,
        callee_name,
        call_type,
        status
      ) VALUES (?, ?, ?, ?, ?, 'pending')`
    ).run(
      payload.invitationId,
      payload.callSessionId,
      payload.callerName,
      payload.calleeName,
      payload.callType
    );
  }

  static updateStatus(invitationId: string, status: CallInvitationStatus): void {
    db.prepare(
      `UPDATE call_invitations
       SET status = ?, responded_at = CURRENT_TIMESTAMP
       WHERE invitation_id = ?`
    ).run(status, invitationId);
  }

  static findByInvitationId(invitationId: string): CallInvitationRecord | undefined {
    return db
      .prepare('SELECT * FROM call_invitations WHERE invitation_id = ?')
      .get(invitationId) as CallInvitationRecord | undefined;
  }
}
