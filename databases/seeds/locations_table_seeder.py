"""LocationsTableSeeder Seeder."""

from masoniteorm.seeds import Seeder

from app.models.Locations import Locations


class LocationsTableSeeder(Seeder):
    def run(self):
        """Run the database seeds."""
        Locations.create(
            {
                "name": "Student Services Building",
                "type": "Building/Entrance",
                "latitude": 194.00,
                "longitude": 566.00,
                "is_routable": True,
            }
        )
        Locations.create(
            {
                "name": "College of Computer Studies (CCS)",
                "type": "Department",
                "latitude": 360.00,
                "longitude": 364.00,
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
                "latitude": 200.00,
                "longitude": 400.00,
                "is_routable": True
            }
        )
        Locations.create(
            {
                "name": "General Service Office Building (GSO)",
                "type": "Office/Building",
                "latitude": 218.00,
                "longitude": 716.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Multi Purpose Building",
                "type": "Building",
                "latitude": 267.00,
                "longitude": 797.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Administrative Building/Registrar's Office",
                "type": "Building/Office",
                "latitude": 400.00,
                "longitude": 500.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "University library",
                "type": "Library",
                "latitude": 302.00,
                "longitude": 636.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Business Affairs Office (BAO)",
                "type": "Office",
                "latitude": 516.00,
                "longitude": 474.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Teacher Education (CTE)",
                "type": "Department",
                "latitude": 538.00,
                "longitude": 326.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Supply Office",
                "type": "Office",
                "latitude": 586.00,
                "longitude": 224.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "University Hotel",
                "type": "Hotel",
                "latitude": 612.00,
                "longitude": 320.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Hospitality Management and Tourism (CHMT)",
                "type": "Department",
                "latitude": 664.00,
                "longitude": 282.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Arts and Sciences (CAS)",
                "type": "Department",
                "latitude": 556.00,
                "longitude": 78.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Business Administration And Accountancy (CBAA)",
                "type": "Department",
                "latitude": 626.00,
                "longitude": 58.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Criminal Justice and Education Academic Building (CCJE)",
                "type": "Department/Academic Building",
                "latitude": 700.00,
                "longitude": 44.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Nursing and Allied Health (CONAH)",
                "type": "Department",
                "latitude": 858.00,
                "longitude": 466.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Sports and Kinetics Building",
                "type": "Building",
                "latitude": 772.00,
                "longitude": 468.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "DOST/C-FOSH Building",
                "type": "C FOSH Facility",
                "latitude": 792.00,
                "longitude": 530.00,
                "is_routable": True 
            }
        )
        Locations.create (
            {
                "name": "Activity Center (AC)",
                "type": "Activity Center",
                "latitude": 680.00,
                "longitude": 514.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Engineering Testing Center",
                "type": "Testing Center",
                "latitude": 754.00,
                "longitude": 630.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Senior High School Building",
                "type": "Building",
                "latitude": 786.00,
                "longitude": 716.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Engineering New Building (COE)",
                "type": "Department",
                "latitude": 806.00,
                "longitude": 650.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "College of Engineering Old Building (COE)",
                "type": "Department",
                "latitude": 906.00,
                "longitude": 632.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "CFOSH Bakery",
                "type": "CFOSH Facility",
                "latitude": 930.00,
                "longitude": 564.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "I.G.P Building",
                "type": "Building",
                "latitude": 958.00,
                "longitude": 742.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "UDRRMO Building",
                "type": "Building",
                "latitude": 818.00,
                "longitude": 818.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "PDNC Building",
                "type": "Building",
                "latitude": 820.00,
                "longitude": 774.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Publication Building And Office (The Gears)",
                "type": "Office",
                "latitude": 718.00,
                "longitude": 826.00,
                "is_routable": True
            }
        )
        Locations.create (
            {
                "name": "Second Gate",
                "type": "Entrance/Exit",
                "latitude": 928.00,
                "longitude": 796.00,
                "is_routable": True
            }
        )
        