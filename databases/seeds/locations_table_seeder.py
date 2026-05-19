"""LocationsTableSeeder Seeder."""

from masoniteorm.seeds import Seeder

from app.models.Locations import Locations


class LocationsTableSeeder(Seeder):
    def run(self):
        """Run the database seeds."""
        Locations.create(
            {
                "name": "Main Gate",
                "type": "Entrance/Exit",
                "latitude": 111.00,
                "longitude": 620.00,
                "is_routable": True
            }
        )
        Locations.create(
            {
                "name": "Student Services Building",
                "type": "Building/Entrance",
                "latitude": 141.05,
                "longitude": 583.00,
                "is_routable": True,
            }
        )
        Locations.create(
            {
                "name": "College of Computer Studies (CCS)",
                "type": "Department",
                "latitude": 392.09,
                "longitude": 624.00,
                "is_routable": True
            }
        )
        Locations.create(
            {
                "name": "Auditor's Office",
                "type": "Office",
                "latitude": 293.00,
                "longitude": 529.00,
                "is_routable": True
            }
        )
        Locations.create(
            {
                "name": "Supreme Student Building",
                "type": "Building",
                "latitude": 100.21,
                "longitude": 716.00,
                "is_routable": True
            }
        )
        Locations.create(
            {
                "name": "General Service Office Building (GSO)",
                "type": "Office/Building",
                "latitude": 96.21,
                "longitude": 788.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Multi Purpose Building",
                "type": "Building",
                "latitude": 188.21,
                "longitude": 848.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Administrative Building/Registrar's Office",
                "type": "Building/Office",
                "latitude": 364.10,
                "longitude": 624.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "University library",
                "type": "Library",
                "latitude": 184.07,
                "longitude": 705.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Business Affairs Office (BAO)",
                "type": "Office",
                "latitude": 496.55,
                "longitude": 624.50,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Teacher Education (CTE)",
                "type": "Department",
                "latitude": 580.08,
                "longitude": 474.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Supply Office",
                "type": "Office",
                "latitude": 686.15,
                "longitude": 396.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "University Hotel",
                "type": "Hotel",
                "latitude": 666.49,
                "longitude": 504.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Hospitality Management and Tourism (CHMT)",
                "type": "Department",
                "latitude": 739.14,
                "longitude": 489.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Arts and Sciences (CAS)",
                "type": "Department",
                "latitude": 696.09,
                "longitude": 320.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Business Administration And Accountancy (CBAA)",
                "type": "Department",
                "latitude": 784.11,
                "longitude": 329.00,
                "is_routable": True
            }
        )
        Locations.create ({
            "name": "Student Center/ROTC Building",
            "type": "Building",
            "latitude": 846.28,
            "longitude": 98.00,
            "is_routable": True
        }
    )
        Locations.create (
            {
                "name": "College of Criminal Justice and Education Academic Building (CCJE)",
                "type": "Academic Building",
                "latitude": 878.15,
                "longitude": 222.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Criminal Justice (CCJE)",
                "type": "Department",
                "latitude": 986.344,
                "longitude": 110.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Industrial Technology (CIT)",
                "type": "Department",
                "latitude": 949.14,
                "longitude": 308.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Industrial Technology Academic Building (CIT)",
                "type": "Academic Building",
                "latitude": 1058.17,
                "longitude": 251.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Automotive Building",
                "type": "Building",
                "latitude": 817.08,
                "longitude": 457.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Nursing and Allied Health (CONAH)",
                "type": "Department",
                "latitude": 870.16,
                "longitude": 732.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "University Clinic",
                "type": "Clinic",
                "latitude": 839.13,
                "longitude": 672.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Sports and Kinetics Building",
                "type": "Building",
                "latitude": 770.53,
                "longitude": 730.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "DOST/C-FOSH Building",
                "type": "C FOSH Facility",
                "latitude": 762.53,
                "longitude": 796.25,
                "is_routable": True 
            }
        )
        Locations.create (
            {
                "name": "Activity Center (AC)",
                "type": "Activity Center",
                "latitude": 578.00,
                "longitude": 796.25,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Engineering Testing Center",
                "type": "Testing Center",
                "latitude": 685.00,
                "longitude": 901.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Senior High School Building",
                "type": "Building",
                "latitude": 682.04,
                "longitude": 716.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Engineering New Building (COE)",
                "type": "Department",
                "latitude": 743.13,
                "longitude": 914.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Engineering Old Building (COE)",
                "type": "Department",
                "latitude": 852.05,
                "longitude": 940.50,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "CFOSH Bakery",
                "type": "CFOSH Facility",
                "latitude": 906.09,
                "longitude": 915.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "I.G.P Building",
                "type": "Building",
                "latitude": 851.15,
                "longitude": 1052.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "UDRRMO Building",
                "type": "Building",
                "latitude": 652.09,
                "longitude": 1112.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "PDNC Computer Lab",
                "type": "Computer Lab",
                "latitude": 678.07,
                "longitude": 1075.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Publication Building And Office (The Gears)",
                "type": "Office",
                "latitude": 553.10,
                "longitude": 1095.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Second Gate",
                "type": "Entrance/Exit",
                "latitude": 788.16,
                "longitude": 1106.00,
                "is_routable": True
            }
        )
        