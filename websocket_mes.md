# WebSocket Message Details

## Authentication Call Message Response

{
"sender": "server",
"laneId": 0,
"type": "CHANNEL",
"subType": "SUBSCRIBERS",
"status": "INFO",
"parameters": {
"channel": "lane-1",
"subscribers": [
"bm-lane-1",
"display-lane-1",
"devlaneapp-lane-1",
"cv-lane-1",
"native-lane-1",
"webview-lane-1",
"devlaneapp-lane-1"
],
"subscriber_count": 7,
"timestamp": 1759988683532
},
"\_debug_info": {
"broadcast_channel": "lane-1",
"target_client": "devlaneapp-lane-1",
"websocket_id": 138945973223152,
"broadcast_timestamp": 1759988683533
}
}

```json
{
  "type": "USER",
  "subType": "WELCOME",
  "status": "INFO",
  "message": "Welcome user",
  "recipient": "display-lane-1",
  "sender": "edge-server",
  "laneId": 1,
  "parameters": {
    "bookingId": "booking_72cd6ab0ee70403d8d9477f6b50738b3",
    "timeSlot": {
      "startTime": "2025-09-24T11:00:00+5:30",
      "endTime": "2025-09-24T18:00:00+5:30",
      "adjustedEndTime": "2025-08-07T09:23:12+00:00"
    },
    "message": "Welcome Prajwal P",
    "userName": "Prajwal P",
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3YjcwMzFlMS0wOTQ2LTRjMjctOGYxYS1kZTNiMmQyMmI5NmQiLCJpYXQiOjE3NTg2OTQyMzEsImV4cCI6MTc1ODY5NzgzMSwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.WmokNqowWy5c2yhV7iaam9V_oNmaL1tjzokHwTM8eKM",
    "membershipType": "Standard",
    "uniqueId": "prajwal@stancebeam.com",
    "userId": "aQuuTiggh0j876jhyt"
  },
  "timestamp": 1758694231.763734,
  "_debug_info": {
    "broadcast_channel": "lane-1",
    "target_client": "webview-lane-1",
    "websocket_id": 138813224438720,
    "broadcast_timestamp": 1758694231767
  }
}
```

### Message Structure Explanation

- **type**: "USER" - Indicates this is a user-related message
- **subType**: "WELCOME" - Specific action type for user welcome
- **status**: "INFO" - Message priority level
- **message**: "Welcome user" - Display message
- **recipient**: "display-lane-1" - Target display lane
- **sender**: "edge-server" - Message origin
- **laneId**: 1 - Lane identifier
- **parameters**: Contains user-specific data including booking details, time slots, user info, and session token
- **timestamp**: Unix timestamp for message timing
- **\_debug_info**: Internal debugging information for message routing

## Bowling Machine Configuration Set Message

```json
{
  "type": "BM_CONFIG",
  "subType": "CONFIG_SET",
  "parameters": {
    "sessionId": "sess_1759209111647_VCPBME",
    "pan": 3100,
    "tilt": 3000,
    "leftTilt": 1200,
    "rightTilt": 1200,
    "leftRPM": 280,
    "rightRPM": 280,
    "ballsCount": 18,
    "ballFrequency": 10,
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao"
  },
  "sender": "webview-lane-1",
  "recipient": "webview-lane-1",
  "laneId": 1,
  "status": "bm-lane-1"
}
```

### Bowling Machine Configuration Structure Explanation

- **type**: "BM_CONFIG" - Indicates this is a bowling machine configuration message
- **subType**: "CONFIG_SET" - Specific action to set bowling machine configuration
- **parameters**: Contains bowling machine settings:
  - **sessionId**: Unique session identifier for the bowling session
  - **pan**: Pan position setting (3100)
  - **tilt**: Tilt position setting (3000)
  - **leftTilt**: Left tilt position (1200)
  - **rightTilt**: Right tilt position (1200)
  - **leftRPM**: Left motor RPM setting (280)
  - **rightRPM**: Right motor RPM setting (280)
  - **ballsCount**: Number of balls to be delivered (18)
  - **ballFrequency**: Frequency of ball delivery (10)
  - **sessionToken**: JWT token for session authentication
- **sender**: "webview-lane-1" - Message origin (webview interface)
- **recipient**: "webview-lane-1" - Target recipient (same as sender for configuration)
- **laneId**: 1 - Lane identifier
- **status**: "bm-lane-1" - Bowling machine status identifier

## Test Ball Release Countdown Message

```json
{
  "type": "DISPLAY",
  "subType": "TEST_BALL",
  "parameters": {
    "countDown": 10,
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao"
  },
  "sender": "webview-lane-1",
  "recipient": "webview-lane-1",
  "laneId": 1,
  "status": "display-lane-1"
}
```

### Test Ball Release Countdown Structure Explanation

- **type**: "DISPLAY" - Indicates this is a display-related message
- **subType**: "TEST_BALL" - Specific action for test ball release countdown
- **parameters**: Contains countdown and session information:
  - **countDown**: Countdown timer value in seconds (10)
  - **sessionToken**: JWT token for session authentication
- **sender**: "webview-lane-1" - Message origin (webview interface)
- **recipient**: "webview-lane-1" - Target recipient (same as sender for display)
- **laneId**: 1 - Lane identifier
- **status**: "display-lane-1" - Display lane status identifier

## Test Ball Release Success Message

```json
{
  "type": "BM_CONFIG",
  "subType": "BALL_RELEASE",
  "parameters": {
    "sessionId": "sess_1759209111647_VCPBME",
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao"
  },
  "sender": "webview-lane-1",
  "recipient": "webview-lane-1",
  "laneId": 1,
  "status": "bm-lane-1"
}
```

### Test Ball Release Success Structure Explanation

- **type**: "BM_CONFIG" - Indicates this is a bowling machine configuration message
- **subType**: "BALL_RELEASE" - Specific action for ball release execution
- **parameters**: Contains session information:
  - **sessionId**: Unique session identifier for the bowling session
  - **sessionToken**: JWT token for session authentication
- **sender**: "webview-lane-1" - Message origin (webview interface)
- **recipient**: "webview-lane-1" - Target recipient (same as sender for configuration)
- **laneId**: 1 - Lane identifier
- **status**: "bm-lane-1" - Bowling machine status identifier

## Session Start Message

```json
{
  "type": "SESSION",
  "subType": "START",
  "parameters": {
    "sessionId": "sess_1759209111647_VCPBME",
    "bowlerSimulation": true,
    "videoReplay": true,
    "ballSimulation": true,
    "statsOverlay": true,
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao"
  },
  "sender": "webview-lane-1",
  "recipient": "webview-lane-1",
  "laneId": 1,
  "status": "bm-lane-1"
}
```

### Session Start Structure Explanation

- **type**: "SESSION" - Indicates this is a session management message
- **subType**: "START" - Specific action to start a new bowling session
- **parameters**: Contains session configuration and features:
  - **sessionId**: Unique session identifier for the bowling session
  - **bowlerSimulation**: Enable bowler simulation features (true)
  - **videoReplay**: Enable video replay functionality (true)
  - **ballSimulation**: Enable ball simulation features (true)
  - **statsOverlay**: Enable statistics overlay display (true)
  - **sessionToken**: JWT token for session authentication
- **sender**: "webview-lane-1" - Message origin (webview interface)
- **recipient**: "webview-lane-1" - Target recipient (same as sender for session management)
- **laneId**: 1 - Lane identifier
- **status**: "bm-lane-1" - Bowling machine status identifier

## Pre-Release Message (5 seconds before ball release)

```json
{
  "type": "SESSION",
  "subType": "PRE_RELEASE",
  "status": "INFO",
  "parameters": {
    "sessionId": "sess_1759209111647_VCPBME",
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao",
    "currentBall": 2,
    "totalBalls": 18,
    "timerStart": 5,
    "message": "Pre release started"
  },
  "timestamp": 1759209348364,
  "sender": "bm-lane-1",
  "laneId": 1,
  "logApp": "edge-server",
  "channelName": "lane-1",
  "appStatus": "RECEIVED",
  "sessionDetails": {
    "sessionUserId": "aQuuTiggh0j876jhyt",
    "sessionUniqueId": "prajwal@stancebeam.com",
    "sessionTokenType": "session",
    "sessionIssuedAt": 1759208603,
    "sessionIssuedAtISO": "2025-09-30T10:33:23Z",
    "sessionTestToken": false,
    "sessionExpiresAt": 1759240800,
    "sessionExpiresAtISO": "2025-09-30T19:30:00Z"
  },
  "timestampISO": "2025-09-30T10:45:48.365687+05:30",
  "_id": "68db67846327b1b056e41b53",
  "metadata": {
    "processed_by": "SessionHandler",
    "processing_time": 1759209348368,
    "operation": "pre_release"
  },
  "_debug_info": {
    "broadcast_channel": "lane-1",
    "target_client": "webview-lane-1",
    "websocket_id": 126805757789248,
    "broadcast_timestamp": 1759209348371
  }
}
```

### Pre-Release Message Structure Explanation

- **type**: "SESSION" - Indicates this is a session management message
- **subType**: "PRE_RELEASE" - Specific action for pre-release countdown (5 seconds before ball release)
- **status**: "INFO" - Message priority level
- **parameters**: Contains pre-release information:
  - **sessionId**: Unique session identifier for the bowling session
  - **sessionToken**: JWT token for session authentication
  - **currentBall**: Current ball number in the session (2)
  - **totalBalls**: Total number of balls in the session (18)
  - **timerStart**: Countdown timer start value in seconds (5)
  - **message**: Status message ("Pre release started")
- **timestamp**: Unix timestamp for message timing
- **sender**: "bm-lane-1" - Message origin (bowling machine)
- **laneId**: 1 - Lane identifier
- **logApp**: "edge-server" - Application that logged the message
- **channelName**: "lane-1" - Broadcast channel name
- **appStatus**: "RECEIVED" - Application status
- **sessionDetails**: Extended session information including user details and token validity
- **timestampISO**: ISO formatted timestamp
- **\_id**: Unique message identifier
- **metadata**: Processing information including handler and operation details
- **\_debug_info**: Internal debugging information for message routing

## Ball Release Success Message

```json
{
  "type": "SESSION",
  "subType": "BALL_RELEASE",
  "status": "SUCCESS",
  "parameters": {
    "sessionId": "sess_1759209111647_VCPBME",
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao",
    "currentBall": 2,
    "totalBalls": 18,
    "message": "Ball released and verified successfully",
    "ballEjected": true,
    "rawValue": 1
  },
  "timestamp": 1759209354260,
  "sender": "bm-lane-1",
  "laneId": 1,
  "logApp": "edge-server",
  "channelName": "lane-1",
  "appStatus": "RECEIVED",
  "sessionDetails": {
    "sessionUserId": "aQuuTiggh0j876jhyt",
    "sessionUniqueId": "prajwal@stancebeam.com",
    "sessionTokenType": "session",
    "sessionIssuedAt": 1759208603,
    "sessionIssuedAtISO": "2025-09-30T10:33:23Z",
    "sessionTestToken": false,
    "sessionExpiresAt": 1759240800,
    "sessionExpiresAtISO": "2025-09-30T19:30:00Z"
  },
  "timestampISO": "2025-09-30T10:45:54.262282+05:30",
  "_id": "68db678a6327b1b056e41b55",
  "metadata": {
    "processed_by": "SessionHandler",
    "processing_time": 1759209354264,
    "operation": "ball_release"
  },
  "_debug_info": {
    "broadcast_channel": "lane-1",
    "target_client": "webview-lane-1",
    "websocket_id": 126805757789248,
    "broadcast_timestamp": 1759209354268
  }
}
```

### Ball Release Success Structure Explanation

- **type**: "SESSION" - Indicates this is a session management message
- **subType**: "BALL_RELEASE" - Specific action for ball release execution
- **status**: "SUCCESS" - Indicates successful ball release operation
- **parameters**: Contains ball release success information:
  - **sessionId**: Unique session identifier for the bowling session
  - **sessionToken**: JWT token for session authentication
  - **currentBall**: Current ball number in the session (2)
  - **totalBalls**: Total number of balls in the session (18)
  - **message**: Success message ("Ball released and verified successfully")
  - **ballEjected**: Boolean indicating ball was successfully ejected (true)
  - **rawValue**: Raw sensor value confirming ball release (1)
- **timestamp**: Unix timestamp for message timing
- **sender**: "bm-lane-1" - Message origin (bowling machine)
- **laneId**: 1 - Lane identifier
- **logApp**: "edge-server" - Application that logged the message
- **channelName**: "lane-1" - Broadcast channel name
- **appStatus**: "RECEIVED" - Application status
- **sessionDetails**: Extended session information including user details and token validity
- **timestampISO**: ISO formatted timestamp
- **\_id**: Unique message identifier
- **metadata**: Processing information including handler and operation details
- **\_debug_info**: Internal debugging information for message routing

## Session Pause Message

```json
{
  "type": "SESSION",
  "subType": "PAUSE",
  "parameters": {
    "sessionId": "sess_1759209111647_VCPBME",
    "reason": "USER_PAUSED",
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao"
  },
  "sender": "webview-lane-1",
  "recipient": "bm-lane-1",
  "laneId": 1,
  "status": "INIT"
}
```

### Session Pause Structure Explanation

- **type**: "SESSION" - Indicates this is a session management message
- **subType**: "PAUSE" - Specific action to pause the current bowling session
- **parameters**: Contains pause information:
  - **sessionId**: Unique session identifier for the bowling session
  - **reason**: Reason for pausing the session ("USER_PAUSED")
  - **sessionToken**: JWT token for session authentication
- **sender**: "webview-lane-1" - Message origin (webview interface)
- **recipient**: "bm-lane-1" - Target recipient (bowling machine)
- **laneId**: 1 - Lane identifier
- **status**: "INIT" - Session status indicating initialization/pause state

## Session Resume Message

```json
{
  "type": "SESSION",
  "subType": "RESUME",
  "status": "SUCCESS",
  "parameters": {
    "code": "SUCCESS",
    "message": "Session resumed successfully",
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao",
    "sessionId": "sess_1759209111647_VCPBME"
  },
  "timestamp": 1759209468178,
  "sender": "bm-lane-1",
  "laneId": 1,
  "logApp": "edge-server",
  "channelName": "lane-1",
  "appStatus": "RECEIVED",
  "sessionDetails": {
    "sessionUserId": "aQuuTiggh0j876jhyt",
    "sessionUniqueId": "prajwal@stancebeam.com",
    "sessionTokenType": "session",
    "sessionIssuedAt": 1759208603,
    "sessionIssuedAtISO": "2025-09-30T10:33:23Z",
    "sessionTestToken": false,
    "sessionExpiresAt": 1759240800,
    "sessionExpiresAtISO": "2025-09-30T19:30:00Z"
  },
  "timestampISO": "2025-09-30T10:47:48.180492+05:30",
  "_id": "68db67fc6327b1b056e41b61",
  "metadata": {
    "processed_by": "SessionHandler",
    "processing_time": 1759209468182,
    "operation": "resume"
  },
  "_debug_info": {
    "broadcast_channel": "lane-1",
    "target_client": "webview-lane-1",
    "websocket_id": 126805757789248,
    "broadcast_timestamp": 1759209468185
  }
}
```

### Session Resume Structure Explanation

- **type**: "SESSION" - Indicates this is a session management message
- **subType**: "RESUME" - Specific action to resume the paused bowling session
- **status**: "SUCCESS" - Indicates successful session resume operation
- **parameters**: Contains resume success information:
  - **code**: Success code ("SUCCESS")
  - **message**: Success message ("Session resumed successfully")
  - **sessionToken**: JWT token for session authentication
  - **sessionId**: Unique session identifier for the bowling session
- **timestamp**: Unix timestamp for message timing
- **sender**: "bm-lane-1" - Message origin (bowling machine)
- **laneId**: 1 - Lane identifier
- **logApp**: "edge-server" - Application that logged the message
- **channelName**: "lane-1" - Broadcast channel name
- **appStatus**: "RECEIVED" - Application status
- **sessionDetails**: Extended session information including user details and token validity
- **timestampISO**: ISO formatted timestamp
- **\_id**: Unique message identifier
- **metadata**: Processing information including handler and operation details
- **\_debug_info**: Internal debugging information for message routing

## Session Stop Message

```json
{
  "type": "BM_CONFIG",
  "subType": "STOP",
  "parameters": {
    "sessionId": "sess_1759209111647_VCPBME",
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4OTljMGY4MS1iYzFkLTQ0ZTctYWE5My01YmFjODJlMDFjNTYiLCJpYXQiOjE3NTkyMDg2MDMsImV4cCI6MTc1OTI0MDgwMCwidXNlcl9pZCI6ImFRdXVUaWdnaDBqODc2amh5dCIsInVuaXF1ZV9pZCI6InByYWp3YWxAc3RhbmNlYmVhbS5jb20iLCJ0b2tlbl90eXBlIjoic2Vzc2lvbiJ9.9NTzrnZpecwDERw0vzGuXTmHnWc61rHbkGHCBrmg1ao"
  },
  "sender": "webview-lane-1",
  "recipient": "bm-lane-1",
  "laneId": 1,
  "status": "INIT"
}
```

### Session Stop Structure Explanation

- **type**: "BM_CONFIG" - Indicates this is a bowling machine configuration message
- **subType**: "STOP" - Specific action to stop the current bowling session
- **parameters**: Contains stop information:
  - **sessionId**: Unique session identifier for the bowling session
  - **sessionToken**: JWT token for session authentication
- **sender**: "webview-lane-1" - Message origin (webview interface)
- **recipient**: "bm-lane-1" - Target recipient (bowling machine)
- **laneId**: 1 - Lane identifier
- **status**: "INIT" - Session status indicating initialization/stop state
