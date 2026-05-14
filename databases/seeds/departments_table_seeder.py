"""DepartmentsTableSeeder Seeder."""

from masoniteorm.seeds import Seeder

from app.models.Departments import Departments
from app.models.Locations import Locations


class DepartmentsTableSeeder(Seeder):
    def run(self):
        """Run the database seeds."""
        existing_location_ids = {
            getattr(department, "location_id", None)
            for department in (Departments.all() or [])
        }
        existing_names = {
            (getattr(department, "name", "") or "").strip()
            for department in (Departments.all() or [])
        }

        for location in list(Locations.all() or []):
            location_type = (getattr(location, "type", "") or "").strip().lower()
            if "department" not in location_type:
                continue

            location_id = getattr(location, "id", None)
            name = (getattr(location, "name", "") or "").strip()
            if location_id is None or not name:
                continue

            if location_id in existing_location_ids or name in existing_names:
                continue

            Departments.create(
                {
                    "location_id": location_id,
                    "name": name,
                }
            )

            existing_location_ids.add(location_id)
            existing_names.add(name)