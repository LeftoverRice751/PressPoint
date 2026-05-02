"""AdminGearsTableSeederTableSeeder Seeder."""

from masoniteorm.seeds import Seeder
from masonite.facades import Hash

from app.models.AdminGears import AdminGears


class AdminGearsTableSeederTableSeeder(Seeder):
    def run(self):
        """Run the database seeds."""
        AdminGears.create (
            {
                "admin_username": "gearsadmin2026",
                "admin_password": Hash.make("thegearspublication456"),
                "role": "admin"
            }
        )
