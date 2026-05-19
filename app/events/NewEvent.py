from datetime import datetime, timezone


try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None


from masonite.configuration import config
from masonite.events import Event

class NewEvent(Event):
    def __init__(self, event_item):
        self.event_item = event_item
        
    def __timezone_name(self):
        return config("application.timezone") or "Asia/Manila"
    
    def _timezone(self):
        if ZoneInfo is None:
            return timezone.utc
        
        try:
            return ZoneInfo(self.__timezone_name())
        except Exception:
            return timezone.utc
        
    def today_key(self):
        return datetime.now(self._timezone()).date().isoformat()
    
    def _format_date(self, value):
        app_timezone = self._timezone()
        
        if isinstance(value, datetime):
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
        occured_on = self._format_date(getattr(self.event_item, "event_date", None))
        return {
            "headline": self.event_item.title,
            "copy": self.event_item.description,
            "kind": "event",
            "date": occured_on,
            "occured_on": occured_on,
            "today_key": self.today_key(),
        }
        
    def broadcast_as(self):
        return "new-news"