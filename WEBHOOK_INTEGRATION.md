# XTSystems Webhook Integration Guide

This document describes how to implement webhook functionality in XTSystems to integrate with the Discord bot and other external systems as described in [issue #68](https://github.com/DevXT-LLC/xtsystems/issues/68).

## Overview

The webhook system enables XTSystems to send real-time notifications to external systems (like Discord, Slack, or custom applications) when specific events occur. This allows for:

- Automated notifications when tickets are created/updated
- Real-time alerts for system events
- Integration with external workflow systems
- Custom automation based on XTSystems events

## Required XTSystems Implementation

### 1. Database Schema

Add webhook management tables to XTSystems:

```sql
-- Webhook configurations table
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL, -- Array of event types
    active BOOLEAN DEFAULT true,
    secret VARCHAR(255), -- For signature verification
    headers JSONB DEFAULT '{}', -- Custom headers
    retry_count INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    UNIQUE(company_id, name)
);

-- Webhook delivery log table
CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    attempts INTEGER DEFAULT 1,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_webhooks_company_id ON webhooks(company_id);
CREATE INDEX idx_webhooks_active ON webhooks(active);
CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
```

### 2. API Endpoints

Add these endpoints to XTSystems:

#### Webhook Management Endpoints

```python
# In your FastAPI application

@app.get("/v1/webhooks")
async def list_webhooks(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all webhooks for the user's company"""
    webhooks = db.query(Webhook).filter(
        Webhook.company_id == user['company_id']
    ).all()
    return webhooks

@app.post("/v1/webhooks")
async def create_webhook(
    webhook: WebhookCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new webhook"""
    db_webhook = Webhook(
        company_id=user['company_id'],
        name=webhook.name,
        url=webhook.url,
        events=webhook.events,
        secret=webhook.secret or generate_secret(),
        headers=webhook.headers or {},
        created_by=user['id']
    )
    db.add(db_webhook)
    db.commit()
    db.refresh(db_webhook)
    return db_webhook

@app.put("/v1/webhooks/{webhook_id}")
async def update_webhook(
    webhook_id: str,
    webhook: WebhookUpdate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing webhook"""
    db_webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.company_id == user['company_id']
    ).first()
    
    if not db_webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    for field, value in webhook.dict(exclude_unset=True).items():
        setattr(db_webhook, field, value)
    
    db.commit()
    return db_webhook

@app.delete("/v1/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a webhook"""
    db_webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.company_id == user['company_id']
    ).first()
    
    if not db_webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    db.delete(db_webhook)
    db.commit()
    return {"message": "Webhook deleted successfully"}

@app.get("/v1/webhooks/{webhook_id}/deliveries")
async def get_webhook_deliveries(
    webhook_id: str,
    limit: int = 50,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get webhook delivery history"""
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.company_id == user['company_id']
    ).first()
    
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    deliveries = db.query(WebhookDelivery).filter(
        WebhookDelivery.webhook_id == webhook_id
    ).order_by(WebhookDelivery.created_at.desc()).limit(limit).all()
    
    return deliveries

@app.post("/v1/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a test webhook"""
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.company_id == user['company_id']
    ).first()
    
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    
    test_payload = {
        "event_type": "webhook.test",
        "data": {
            "message": "This is a test webhook",
            "timestamp": datetime.utcnow().isoformat(),
            "webhook_id": webhook_id
        },
        "company_id": str(user['company_id']),
        "timestamp": int(time.time())
    }
    
    success = await send_webhook(webhook, test_payload)
    return {"success": success, "message": "Test webhook sent"}
```

### 3. Webhook Service Implementation

```python
# webhook_service.py

import asyncio
import aiohttp
import hashlib
import hmac
import json
import time
from typing import Dict, Any, List
from sqlalchemy.orm import Session

class WebhookService:
    def __init__(self, db: Session):
        self.db = db
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30)
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def send_webhook(self, webhook: Webhook, payload: Dict[str, Any]) -> bool:
        """Send webhook with retry logic"""
        delivery = WebhookDelivery(
            webhook_id=webhook.id,
            event_type=payload.get('event_type'),
            payload=payload
        )
        
        for attempt in range(webhook.retry_count):
            try:
                success = await self._send_single_webhook(webhook, payload)
                if success:
                    delivery.delivered_at = datetime.utcnow()
                    delivery.response_status = 200
                    delivery.attempts = attempt + 1
                    self.db.add(delivery)
                    self.db.commit()
                    return True
                
                # Wait before retry (exponential backoff)
                if attempt < webhook.retry_count - 1:
                    await asyncio.sleep(2 ** attempt)
                    
            except Exception as e:
                delivery.response_body = str(e)
                delivery.attempts = attempt + 1
                
        # Log failed delivery
        delivery.response_status = 0
        self.db.add(delivery)
        self.db.commit()
        return False
    
    async def _send_single_webhook(self, webhook: Webhook, payload: Dict[str, Any]) -> bool:
        """Send a single webhook request"""
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'XTSystems-Webhook/1.0',
            **webhook.headers
        }
        
        # Add timestamp for replay protection
        timestamp = str(int(time.time()))
        payload_str = json.dumps(payload, separators=(',', ':'))
        
        # Generate signature if secret is provided
        if webhook.secret:
            signature = hmac.new(
                webhook.secret.encode(),
                (timestamp + payload_str).encode(),
                hashlib.sha256
            ).hexdigest()
            headers['X-XTSystems-Signature'] = f'sha256={signature}'
            headers['X-XTSystems-Timestamp'] = timestamp
        
        async with self.session.post(
            webhook.url,
            data=payload_str,
            headers=headers
        ) as response:
            return response.status < 400
    
    async def trigger_event(self, event_type: str, data: Dict[str, Any], company_id: str):
        """Trigger webhooks for a specific event type"""
        webhooks = self.db.query(Webhook).filter(
            Webhook.company_id == company_id,
            Webhook.active == True,
            Webhook.events.contains([event_type])
        ).all()
        
        if not webhooks:
            return
        
        payload = {
            "event_type": event_type,
            "data": data,
            "company_id": company_id,
            "timestamp": int(time.time())
        }
        
        # Send webhooks concurrently
        tasks = [self.send_webhook(webhook, payload) for webhook in webhooks]
        await asyncio.gather(*tasks, return_exceptions=True)

# Global webhook service instance
webhook_service = WebhookService()
```

### 4. Integration Points

Add webhook triggers to existing XTSystems functions:

```python
# In ticket creation/update functions
async def create_ticket(ticket_data: dict, user: dict, db: Session):
    # ... existing ticket creation logic ...
    
    # Trigger webhook
    async with WebhookService(db) as webhook_service:
        await webhook_service.trigger_event(
            "ticket.created",
            {
                "id": ticket.id,
                "title": ticket.title,
                "description": ticket.description,
                "priority": ticket.priority,
                "status": ticket.status,
                "created_by": user['username'],
                "company_name": user['company_name'],
                "created_at": ticket.created_at.isoformat()
            },
            user['company_id']
        )
    
    return ticket

async def update_ticket(ticket_id: str, update_data: dict, user: dict, db: Session):
    # ... existing ticket update logic ...
    
    # Trigger webhook
    async with WebhookService(db) as webhook_service:
        await webhook_service.trigger_event(
            "ticket.updated",
            {
                "id": ticket.id,
                "title": ticket.title,
                "status": ticket.status,
                "priority": ticket.priority,
                "updated_by": user['username'],
                "updated_at": ticket.updated_at.isoformat(),
                "notes": [note.to_dict() for note in ticket.notes[-3:]]  # Last 3 notes
            },
            user['company_id']
        )

# Similar implementations for:
# - asset.created
# - asset.updated  
# - user.created
# - company.created
# - machine.registered
# - machine.approved
# - alert.triggered
```

### 5. Pydantic Models

```python
# models.py

from pydantic import BaseModel, HttpUrl
from typing import List, Dict, Any, Optional

class WebhookCreate(BaseModel):
    name: str
    url: HttpUrl
    events: List[str]
    secret: Optional[str] = None
    headers: Optional[Dict[str, str]] = {}
    active: bool = True
    retry_count: int = 3
    timeout_seconds: int = 30

class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[HttpUrl] = None
    events: Optional[List[str]] = None
    secret: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    active: Optional[bool] = None
    retry_count: Optional[int] = None
    timeout_seconds: Optional[int] = None

class WebhookResponse(BaseModel):
    id: str
    company_id: str
    name: str
    url: str
    events: List[str]
    active: bool
    created_at: str
    updated_at: str
    
    class Config:
        from_attributes = True
```

## Discord Bot Integration

The Discord bot is already configured to:

1. **Receive Webhooks**: Listen on `/webhooks/xtsystems` endpoint
2. **Verify Signatures**: Validate webhook authenticity using HMAC signatures
3. **Process Events**: Handle different event types and send Discord notifications
4. **Interactive Actions**: Provide buttons for approving/denying machine registrations
5. **Auto-Register**: Register itself as a webhook in XTSystems

### Setting up the Integration

1. **Configure Discord Bot Webhook Endpoint**:
   ```bash
   # In Discord bot .env file
   WEBHOOK_PORT=3000
   WEBHOOK_SECRET=your_secure_webhook_secret
   DISCORD_WEBHOOK_CHANNELS={"ticket_created":["channel_id"],"alert_triggered":["channel_id"]}
   ```

2. **Register Discord Bot Webhook in XTSystems**:
   ```bash
   # POST to XTSystems webhook registration endpoint
   curl -X POST "http://localhost:20437/v1/webhooks" \
     -H "Authorization: Bearer $XTSYSTEMS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Discord Bot Integration",
       "url": "http://your-discord-bot-url:3000/webhooks/xtsystems",
       "events": ["ticket.created", "ticket.updated", "machine.registered", "alert.triggered"],
       "secret": "your_secure_webhook_secret"
     }'
   ```

3. **Test the Integration**:
   ```bash
   # Test webhook endpoint
   curl -X POST "http://localhost:20437/v1/webhooks/{webhook_id}/test" \
     -H "Authorization: Bearer $XTSYSTEMS_API_KEY"
   ```

## Supported Event Types

| Event Type | Description | Triggered When |
|------------|-------------|----------------|
| `ticket.created` | New ticket created | User creates a new ticket |
| `ticket.updated` | Ticket modified | Ticket status, priority, or notes updated |
| `ticket.closed` | Ticket closed | Ticket status set to closed/resolved |
| `asset.created` | New asset added | Asset registered in system |
| `asset.updated` | Asset modified | Asset properties or status changed |
| `user.created` | New user registered | User account created |
| `company.created` | New company added | Company registered in system |
| `machine.registered` | Machine registration | New machine requests approval |
| `machine.approved` | Machine approved | Machine registration approved |
| `alert.triggered` | System alert | Monitoring alert triggered |

## Security Considerations

1. **Signature Verification**: All webhooks include HMAC-SHA256 signatures
2. **Timestamp Validation**: Prevent replay attacks with timestamp verification
3. **HTTPS Required**: Production webhooks should use HTTPS
4. **Rate Limiting**: Implement rate limiting on webhook endpoints
5. **Secret Rotation**: Regularly rotate webhook secrets
6. **Access Control**: Webhook management requires proper user permissions

## Testing and Monitoring

1. **Webhook Testing**: Use the test endpoint to verify webhook delivery
2. **Delivery Logs**: Monitor webhook delivery success/failure rates
3. **Retry Logic**: Failed webhooks are automatically retried with exponential backoff
4. **Health Monitoring**: Monitor webhook endpoint availability

## Implementation Priority

1. **Phase 1**: Basic webhook infrastructure and database schema
2. **Phase 2**: Core event triggers (tickets, assets)
3. **Phase 3**: Advanced events (machines, alerts, users)
4. **Phase 4**: Management UI and monitoring dashboard
5. **Phase 5**: Advanced features (conditional webhooks, templates)

This implementation provides a robust foundation for the webhook system described in issue #68, enabling seamless integration between XTSystems and external services like the Discord bot.
