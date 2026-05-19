from masonite.middleware import Middleware

class NewsEditorMiddleware(Middleware):
    def before(self, request, response):
        user = request.user()
        if not user:
            return response.redirect(name="auth.news-editor.login")
        role = (getattr(user, "role", "") or "").strip().lower()
        if role != "news_editor":
            return response.redirect(name="auth.news-editor.login")
        return request

    def after(self, request, response):
        return request