"""Base Database Seeder Module."""
from masoniteorm.seeds import Seeder

from .user_table_seeder import UserTableSeeder
from .admin_gears_table_seeder_table_seeder import AdminGearsTableSeederTableSeeder
from .locations_table_seeder import LocationsTableSeeder


class DatabaseSeeder(Seeder):
    def run(self):
        """Run the database seeds."""
        self.call(
            UserTableSeeder, 
            
            AdminGearsTableSeederTableSeeder, 
            
            LocationsTableSeeder
            
            )
