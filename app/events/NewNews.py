from datetime import datetime, timezone
from masonite.configuration import config
from masonite.events import Event
from pendulum import instance

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None
    

class NewNews(Event):
    def __init__(self, news_item):
        self.news_item = news_item
        
    def _timezone_name(self):
        return config("application.timezone") or "Asia/Manila"
    
    def _timezone(self):
        if ZoneInfo is None:
            return timezone.utc
        
        try:
            return ZoneInfo(self._timezone_name())
        except Exception:
            return timezone.utc
        
    def _today_key(self):
        return datetime.now(self.timezone()).date().isoformat()
    
    def _format_date(self, value):
        app_timezone = self._timezone()
        
        if instance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=app_timezone).date().isoformat()
            return value.astimezone(app_timezone).date().isoformat()
        
        if value is None:
            return ""
        
        text = str(value).strip()
        if not text:
            return ""
        
        normalized_text = text.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized_text)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=app_timezone)
            else:
                parsed = parsed.astimezone(app_timezone)
            return parsed.date().isoformat()
        except ValueError:
            if len(text) >= 10:
                return text[:10]
        return ""
    
    def broadcast_on(self):
        return ["flash-updates-channel"]
    
    def broadcast_with(self):
        published_at = getattr(self.news_item, "published_at", None) or getattr(self.news_item, "created_at", None)
        occured_on = self._format_date(published_at)
        return {
            "headline": self.news_item.title,
            "copy": self.news_item.description,
            "kind": "news",
            "date": occured_on,
            "occured_on": occured_on,
            "today_key": self._today_key(),
        }
        
    def broadcast_as(self):
        return "app.events.NewNews"
    
    