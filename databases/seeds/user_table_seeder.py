"""UserTableSeeder Seeder."""
from masoniteorm.seeds import Seeder
from masonite.facades import Hash

from app.models.User import User


class UserTableSeeder(Seeder):
    def run(self):
        """Run the database seeds."""
        User.create(
            {
                "username": "Joe",
                "password": Hash.make("secret"),
                "email": "joe@example.com",
                "role": "admin"
            }
        )
