from masonite.controllers import Controller
from masonite.views import View


class ChatbotController(Controller):
    def show(self, view: View):
        return view.render("welcome")