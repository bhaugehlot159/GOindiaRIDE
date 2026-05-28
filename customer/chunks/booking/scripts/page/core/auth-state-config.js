// ============================================
        // AUTHENTICATION CHECK
        // ============================================

        function checkAuth() {
            const userRole = localStorage.getItem('userRole');
            const currentUser = localStorage.getItem('currentUser');

            if (userRole !== 'customer' || !currentUser) {
                alert('Please login as customer to book a ride');
                window.location.href = './login.html';
                return null;
            }

            const parsedUser = JSON.parse(currentUser);
            if (customerRowLooksDriver(parsedUser) || !customerRowLooksCustomer(parsedUser)) {
                alert('Please login as customer to book a ride');
                window.location.href = './login.html';
                return null;
            }
            return parsedUser;
        }

        let currentUser = null;
        let selectedDonationAmount = 0;
        let currentRideForDonation = null;
        let appliedPromo = null;
        let latestFareEstimate = null;
        const ADMIN_REVIEW_QUEUE_SIGNAL_KEY = 'goindiaride_admin_review_queue_signal_v1';

        const PROMO_OFFERS = {
            RIDE50: { type: 'flat', value: 50, description: 'Flat INR 50 off on any ride' },
            SAVE10: { type: 'percent', value: 10, max: 250, description: '10% off up to INR 250' },
            AIRPORT100: { type: 'flat', value: 100, tripPlan: 'airport', description: 'Airport transfer flat INR 100 off' },
            GLOBAL15: { type: 'percent', value: 15, max: 400, paymentMethods: ['international_card', 'paypal'], description: '15% off for international payment methods' }
        };

        const CAB_FLOW_CONFIG = {
            airport: {
                label: 'Airport Cabs',
                shortLabel: 'Airport',
                tripPlan: 'airport',
                serviceType: 'airport_transfer',
                notice: 'Airport transfer made easy: add pickup/drop and schedule your ride.',
                packageLabel: 'Airport transfer'
            },
            local: {
                label: 'Local Cabs',
                shortLabel: 'Local',
                tripPlan: 'city',
                serviceType: 'city_local_trip',
                notice: 'Book local city cabs for point-to-point pickup and drop.',
                packageLabel: 'City ride'
            },
            outstation: {
                label: 'Outstation Cabs',
                shortLabel: 'Outstation',
                tripPlan: 'outstation',
                serviceType: 'round_trip_service',
                notice: 'Plan one-way or round-trip intercity rides with transparent fare.',
                packageLabel: 'One way or round trip'
            },
            day_trips: {
                label: 'Day Plan',
                shortLabel: 'Day Plan',
                tripPlan: 'rental',
                serviceType: 'city_local_trip',
                notice: 'Book full-day cab plans with per-day km allowance, extra km billing, and driver preference.',
                packageLabel: '1 Day / 300 kms'
            }
        };
        const CAB_FLOW_TRIP_PLAN_OPTIONS = {
            airport: ['airport'],
            local: ['city'],
            outstation: ['outstation'],
            day_trips: ['rental']
        };
        const CAB_FLOW_SERVICE_TYPE_OPTIONS = {
            airport: ['airport_transfer'],
            local: ['city_local_trip'],
            outstation: ['round_trip_service'],
            day_trips: ['city_local_trip']
        };
        const CAB_DAY_PLAN_PACKAGE_OPTIONS = Array.from({ length: 15 }, (_, index) => {
            const days = index + 1;
            const includedKm = days * 300;
            return {
                value: `day_plan_${days}d`,
                label: `${days} ${days === 1 ? 'Day' : 'Days'} / ${includedKm} kms - Day plan`
            };
        });
        const CAB_DAY_PLAN_PACKAGE_VALUES = CAB_DAY_PLAN_PACKAGE_OPTIONS.map((option) => option.value);
        const AIRPORT_HOURLY_PACKAGE_OPTIONS = [
            { value: 'airport_2h', label: '2 hrs / 20 kms - Airport buffer' },
            { value: 'airport_4h', label: '4 hrs / 40 kms - Airport hourly' },
            { value: 'airport_8h', label: '8 hrs / 80 kms - Airport extended hourly' },
            { value: 'airport_12h', label: '12 hrs / 120 kms - Long airport hourly' }
        ];
        const AIRPORT_FULL_DAY_PACKAGE_OPTIONS = Array.from({ length: 15 }, (_, index) => {
            const days = index + 1;
            const includedKm = days * 300;
            return {
                value: `airport_day_${days}d`,
                label: `${days} ${days === 1 ? 'Day' : 'Days'} / ${includedKm} kms - Airport full-day duty`
            };
        });
        const AIRPORT_PACKAGE_OPTIONS = [
            ...AIRPORT_HOURLY_PACKAGE_OPTIONS,
            ...AIRPORT_FULL_DAY_PACKAGE_OPTIONS
        ];
        const AIRPORT_SERVICE_CONFIG = {
            airport_drop: {
                label: 'Airport Drop',
                notice: 'City, hotel, station or home pickup to selected Indian airport with reporting-time buffer.',
                pickupRole: 'place',
                dropRole: 'airport',
                journeyMode: 'one_way',
                pickupLabel: 'Pickup place',
                dropLabel: 'Airport',
                pickupPlaceholder: 'City, hotel, station or address',
                dropPlaceholder: 'Search destination airport in India',
                terminalLabel: 'Drop terminal',
                terminalPlaceholder: 'Drop terminal/gate, e.g. T1 departures or Gate 4',
                chips: ['Airport drop', 'Reporting buffer', 'Driver details', 'Parking/toll review']
            },
            airport_pickup: {
                label: 'Airport Pickup',
                notice: 'Airport arrival pickup to city, hotel, office or station with flight-delay readiness.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'one_way',
                pickupLabel: 'Airport',
                dropLabel: 'Destination',
                pickupPlaceholder: 'Search arrival airport in India',
                dropPlaceholder: 'City, hotel, office or address',
                terminalLabel: 'Pickup terminal',
                terminalPlaceholder: 'Arrival terminal, gate, pillar or pickup point',
                chips: ['Arrival pickup', 'Flight delay ready', 'Meet & greet note', 'Luggage fit']
            },
            airport_to_airport: {
                label: 'Airport Transfer - Terminal',
                notice: 'Airport transfer covers terminal-to-terminal movement. Choose Return pickup below when the same booking needs a scheduled pickup back.',
                pickupRole: 'airport',
                dropRole: 'airport',
                journeyMode: 'one_way',
                pickupLabel: 'Airport From',
                dropLabel: 'Airport To',
                pickupPlaceholder: 'Search departure airport in India',
                dropPlaceholder: 'Search destination airport in India',
                terminalLabel: 'Terminal details',
                terminalPlaceholder: 'From terminal/gate and destination terminal/gate',
                chips: ['Terminal transfer', 'Airport from/to', 'Flight details', 'Luggage-ready cab']
            },
            airport_round: {
                label: 'Airport Transfer - Return Pickup',
                notice: 'Airport transfer with scheduled return pickup. Add return date and return time for the return leg.',
                pickupRole: 'place',
                dropRole: 'airport',
                journeyMode: 'round_trip',
                requiresReturn: true,
                pickupLabel: 'Pickup place',
                dropLabel: 'Airport',
                pickupPlaceholder: 'City, hotel, station or address',
                dropPlaceholder: 'Search airport for round trip',
                terminalLabel: 'Return terminal',
                terminalPlaceholder: 'Drop terminal and return pickup terminal/gate',
                chips: ['Drop + return pickup', 'Return date/time', 'Waiting ready', 'Same-route clarity']
            },
            airport_hourly: {
                label: 'Airport Hourly',
                notice: 'Airport pickup/drop plus hourly city use for meetings, errands, guest movement or layover work.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'one_way',
                requiresPackage: true,
                defaultPackage: 'airport_4h',
                pickupLabel: 'Airport',
                dropLabel: 'City base',
                pickupPlaceholder: 'Search airport in India',
                dropPlaceholder: 'City area, hotel or office base',
                terminalLabel: 'Airport terminal',
                terminalPlaceholder: 'Airport terminal/gate for pickup or drop',
                chips: ['Hourly package', 'Extra km/hr billed', 'Multiple city stops', 'Layover support']
            },
            airport_day: {
                label: 'Airport Full Day',
                notice: 'Airport full-day duty with 300 km included per day. Extra km, toll/parking/permit, and driver allowance are reviewed before assignment.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'one_way',
                requiresPackage: true,
                optionalStops: true,
                defaultPackage: 'airport_day_1d',
                pickupLabel: 'Airport',
                dropLabel: 'Day base',
                pickupPlaceholder: 'Search airport in India',
                dropPlaceholder: 'City/hotel base for full-day duty',
                terminalLabel: 'Airport terminal',
                terminalPlaceholder: 'Terminal/gate where full-day duty starts',
                chips: ['300 km/day included', 'Extra km billed', 'Driver allowance', 'Toll/parking review']
            },
            airport_multi: {
                label: 'Airport Multi-stop',
                notice: 'Airport pickup/drop with multiple planned stops. Add each route stop below before moving ahead.',
                pickupRole: 'airport',
                dropRole: 'place',
                journeyMode: 'multi_city',
                routeAddons: true,
                pickupLabel: 'Airport',
                dropLabel: 'Final drop',
                pickupPlaceholder: 'Search airport in India',
                dropPlaceholder: 'Final destination after stops',
                terminalLabel: 'Airport terminal',
                terminalPlaceholder: 'Airport terminal/gate before route stops',
                chips: ['Multi-stop', 'Route add-ons', 'Hotel/meeting stops', 'Route-aware fare']
            }
        };
        const INDIA_AIRPORT_SUGGESTIONS = [
            'Veer Savarkar International Airport|Port Blair|Andaman and Nicobar Islands|IXZ|Port Blair Airport',
            'Agatti Airport|Agatti Island|Lakshadweep|AGX|Lakshadweep Airport',
            'Puducherry Airport|Puducherry|Puducherry|PNY|Pondicherry Airport',
            'Chandigarh Airport|Chandigarh|Chandigarh|IXC|Shaheed Bhagat Singh International Airport Chandigarh',
            'Indira Gandhi International Airport|New Delhi|Delhi|DEL|IGI Airport;Delhi Airport',
            'Safdarjung Airport|New Delhi|Delhi||Safdarjung Airfield',
            'Daman Airport|Daman|Dadra and Nagar Haveli and Daman and Diu|NMB|Daman Airfield',
            'Diu Airport|Diu|Dadra and Nagar Haveli and Daman and Diu|DIU|Diu Aerodrome',
            'Jammu Airport|Jammu|Jammu and Kashmir|IXJ|Satwari Airport',
            'Srinagar Airport|Srinagar|Jammu and Kashmir|SXR|Sheikh ul-Alam International Airport',
            'Kushok Bakula Rimpochee Airport|Leh|Ladakh|IXL|Leh Airport',
            'Kadapa Airport|Kadapa|Andhra Pradesh|CDP|Cuddapah Airport',
            'Kurnool Airport|Kurnool|Andhra Pradesh|KJB|Uyyalawada Narasimha Reddy Airport',
            'Rajahmundry Airport|Rajahmundry|Andhra Pradesh|RJA|Rajamahendravaram Airport',
            'Sri Sathya Sai Airport|Puttaparthi|Andhra Pradesh|PUT|Puttaparthi Airport',
            'Tirupati Airport|Tirupati|Andhra Pradesh|TIR|Renigunta Airport',
            'Vijayawada International Airport|Vijayawada|Andhra Pradesh|VGA|Gannavaram Airport',
            'Visakhapatnam International Airport|Visakhapatnam|Andhra Pradesh|VTZ|Vizag Airport',
            'Bhogapuram International Airport|Visakhapatnam|Andhra Pradesh|VOX|Alluri Sitarama Raju International Airport',
            'Donakonda Airport|Donakonda|Andhra Pradesh||Donakonda Airfield',
            'Donyi Polo Airport|Itanagar|Arunachal Pradesh|HGI|Hollongi Airport',
            'Pasighat Airport|Pasighat|Arunachal Pradesh|IXT|Pasighat Advanced Landing Ground',
            'Tezu Airport|Tezu|Arunachal Pradesh|TEI|Tezu ALG',
            'Ziro Airport|Ziro|Arunachal Pradesh|ZER|Ziro ALG',
            'Daporijo Airport|Daporijo|Arunachal Pradesh||Daporijo ALG',
            'Lokpriya Gopinath Bordoloi International Airport|Guwahati|Assam|GAU|Guwahati Airport',
            'Dibrugarh Airport|Dibrugarh|Assam|DIB|Mohanbari Airport',
            'Silchar Airport|Silchar|Assam|IXS|Kumbhirgram Airport',
            'Jorhat Airport|Jorhat|Assam|JRH|Rowriah Airport',
            'Lilabari Airport|North Lakhimpur|Assam|IXI|Lakhimpur Airport',
            'Tezpur Airport|Tezpur|Assam|TEZ|Salonibari Airport',
            'Rupsi Airport|Dhubri|Assam|RUP|Rupsi Aerodrome',
            'Darbhanga Airport|Darbhanga|Bihar|DBR|Darbhanga Civil Enclave',
            'Gaya Airport|Gaya|Bihar|GAY|Bodh Gaya Airport',
            'Jay Prakash Narayan Airport|Patna|Bihar|PAT|Patna Airport',
            'Purnea Airport|Purnea|Bihar||Purnia Airport',
            'Muzaffarpur Airport|Muzaffarpur|Bihar||Muzaffarpur Airfield',
            'Raxaul Airport|Raxaul|Bihar||Raxaul Airstrip',
            'Swami Vivekananda Airport|Raipur|Chhattisgarh|RPR|Raipur Airport',
            'Bilaspur Airport|Bilaspur|Chhattisgarh|PAB|Bilasa Devi Kevat Airport',
            'Jagdalpur Airport|Jagdalpur|Chhattisgarh|JGB|Maa Danteshwari Airport',
            'Maa Mahamaya Airport|Ambikapur|Chhattisgarh||Ambikapur Airport',
            'Raigarh Airport|Raigarh|Chhattisgarh||Raigarh Airstrip',
            'Korba Airport|Korba|Chhattisgarh||Korba Airstrip',
            'Dabolim Airport|Goa|Goa|GOI|Goa International Airport',
            'Manohar International Airport|Mopa|Goa|GOX|Mopa Airport',
            'Sardar Vallabhbhai Patel International Airport|Ahmedabad|Gujarat|AMD|Ahmedabad Airport',
            'Bhavnagar Airport|Bhavnagar|Gujarat|BHU|Bhavnagar Civil Aerodrome',
            'Bhuj Airport|Bhuj|Gujarat|BHJ|Bhuj Rudra Mata Airport',
            'Deesa Airport|Deesa|Gujarat||Deesa Airfield',
            'Dholera International Airport|Dholera|Gujarat||Dholera Airport',
            'Jamnagar Airport|Jamnagar|Gujarat|JGA|Govardhanpur Airport',
            'Kandla Airport|Kandla|Gujarat|IXY|Gandhidham Airport',
            'Keshod Airport|Keshod|Gujarat|IXK|Keshod Aerodrome',
            'Mundra Airport|Mundra|Gujarat|MUN|Mundra Airfield',
            'Porbandar Airport|Porbandar|Gujarat|PBD|Porbandar Civil Aerodrome',
            'Rajkot International Airport|Hirasar|Gujarat|HSR|Hirasar Airport',
            'Rajkot Airport|Rajkot|Gujarat|RAJ|Rajkot Civil Airport',
            'Surat International Airport|Surat|Gujarat|STV|Surat Airport',
            'Vadodara Airport|Vadodara|Gujarat|BDQ|Baroda Airport',
            'Amreli Airport|Amreli|Gujarat||Amreli Airstrip',
            'Ambala Air Force Station|Ambala|Haryana||Ambala Airport',
            'Bhiwani Airport|Bhiwani|Haryana||Bhiwani Aerodrome',
            'Maharaja Agrasen Airport|Hisar|Haryana|HSS|Hisar Airport',
            'Karnal Airport|Karnal|Haryana||Karnal Aerodrome',
            'Narnaul Airport|Narnaul|Haryana||Bachhod Airstrip',
            'Pinjore Airport|Pinjore|Haryana||Pinjore Airstrip',
            'Kangra Airport|Gaggal|Himachal Pradesh|DHM|Dharamshala Airport',
            'Kullu-Manali Airport|Bhuntar|Himachal Pradesh|KUU|Bhuntar Airport',
            'Shimla Airport|Shimla|Himachal Pradesh|SLV|Jubbarhatti Airport',
            'Birsa Munda Airport|Ranchi|Jharkhand|IXR|Ranchi Airport',
            'Bokaro Airport|Bokaro|Jharkhand||Bokaro Aerodrome',
            'Deoghar Airport|Deoghar|Jharkhand|DGH|Baba Baidyanath Airport',
            'Dhanbad Airport|Dhanbad|Jharkhand|DBD|Dhanbad Airstrip',
            'Dumka Airport|Dumka|Jharkhand||Dumka Airport',
            'Sonari Airport|Jamshedpur|Jharkhand|IXW|Jamshedpur Airport',
            'Dhalbhumgarh Airport|Dhalbhumgarh|Jharkhand||Dhalbhumgarh Airfield',
            'Kempegowda International Airport|Bengaluru|Karnataka|BLR|Bangalore Airport',
            'HAL Airport|Bengaluru|Karnataka||Bengaluru HAL Airport',
            'Jakkur Aerodrome|Bengaluru|Karnataka||Jakkur Airport',
            'Belagavi Airport|Belagavi|Karnataka|IXG|Belgaum Airport',
            'Bidar Airport|Bidar|Karnataka|IXX|Bidar Civil Enclave',
            'Hubballi Airport|Hubballi|Karnataka|HBX|Hubli Airport',
            'Kalaburagi Airport|Kalaburagi|Karnataka|GBI|Gulbarga Airport',
            'Mangaluru International Airport|Mangaluru|Karnataka|IXE|Mangalore Airport',
            'Mysuru Airport|Mysuru|Karnataka|MYQ|Mandakalli Airport',
            'Rashtrakavi Kuvempu Airport|Shivamogga|Karnataka|RQY|Shivamogga Airport',
            'Vidyanagar Airport|Ballari|Karnataka|VDY|Jindal Vijaynagar Airport;Toranagallu Airport',
            'Baldota Koppal Aerodrome|Koppal|Karnataka||Baldota Airport',
            'Cochin International Airport|Kochi|Kerala|COK|Kochi Airport',
            'Calicut International Airport|Kozhikode|Kerala|CCJ|Karipur Airport',
            'Kannur International Airport|Kannur|Kerala|CNN|Kannur Airport',
            'Thiruvananthapuram International Airport|Thiruvananthapuram|Kerala|TRV|Trivandrum Airport',
            'Bekal Airport|Bekal|Kerala||Bekal Airstrip',
            'Raja Bhoj Airport|Bhopal|Madhya Pradesh|BHO|Bhopal Airport',
            'Devi Ahilya Bai Holkar Airport|Indore|Madhya Pradesh|IDR|Indore Airport',
            'Jabalpur Airport|Jabalpur|Madhya Pradesh|JLR|Dumna Airport',
            'Rajmata Vijaya Raje Scindia Airport|Gwalior|Madhya Pradesh|GWL|Gwalior Airport',
            'Khajuraho Airport|Khajuraho|Madhya Pradesh|HJR|Khajuraho Civil Aerodrome',
            'Rewa Airport|Rewa|Madhya Pradesh|REW|Rewa Airstrip',
            'Datia Airport|Datia|Madhya Pradesh||Datia Airstrip',
            'Khandwa Airport|Khandwa|Madhya Pradesh||Khandwa Airstrip',
            'Dhana Airport|Sagar|Madhya Pradesh||Sagar Airport',
            'Birlagram Airport|Nagda|Madhya Pradesh||Birlagram Airstrip',
            'Panna Airport|Panna|Madhya Pradesh||Panna Airstrip',
            'Satna Airport|Satna|Madhya Pradesh|TNI|Satna Airstrip',
            'Chhatrapati Shivaji Maharaj International Airport|Mumbai|Maharashtra|BOM|Mumbai Airport',
            'Juhu Aerodrome|Mumbai|Maharashtra||Juhu Airport',
            'Navi Mumbai International Airport|Navi Mumbai|Maharashtra|NMI|D. B. Patil International Airport',
            'Pune Airport|Pune|Maharashtra|PNQ|Lohegaon Airport',
            'Dr. Babasaheb Ambedkar International Airport|Nagpur|Maharashtra|NAG|Nagpur Airport',
            'Chikkalthana Airport|Chhatrapati Sambhajinagar|Maharashtra|IXU|Aurangabad Airport',
            'Nashik Airport|Nashik|Maharashtra|ISK|Ozar Airport',
            'Shirdi Airport|Shirdi|Maharashtra|SAG|Kakadi Airport',
            'Kolhapur Airport|Kolhapur|Maharashtra|KLH|Chhatrapati Rajaram Maharaj Airport',
            'Jalgaon Airport|Jalgaon|Maharashtra|JLG|Jalgaon Aerodrome',
            'Shri Guru Gobind Singh Ji Airport|Nanded|Maharashtra|NDC|Nanded Airport',
            'Sindhudurg Airport|Sindhudurg|Maharashtra|SDW|Chipi Airport',
            'Solapur Airport|Solapur|Maharashtra|SSE|Solapur Airstrip',
            'Akola Airport|Akola|Maharashtra|AKD|Akola Shivani Airport',
            'Amravati Airport|Amravati|Maharashtra||Belora Airport',
            'Baramati Airport|Baramati|Maharashtra||Baramati Airstrip',
            'Gondia Airport|Gondia|Maharashtra|GDB|Birsi Airport',
            'Latur Airport|Latur|Maharashtra|LTU|Latur Airstrip',
            'Osmanabad Airport|Dharashiv|Maharashtra|OMN|Osmanabad Airport',
            'Ratnagiri Airport|Ratnagiri|Maharashtra|RTC|Ratnagiri Airfield',
            'Yavatmal Airport|Yavatmal|Maharashtra||Yavatmal Airstrip',
            'Imphal International Airport|Imphal|Manipur|IMF|Bir Tikendrajit International Airport',
            'Shillong Airport|Shillong|Meghalaya|SHL|Umroi Airport',
            'Shella Airport|Shella|Meghalaya||Shella Airstrip',
            'Lengpui Airport|Aizawl|Mizoram|AJL|Aizawl Airport',
            'Turial Airfield|Turial|Mizoram||Turial Airport',
            'Dimapur Airport|Dimapur|Nagaland|DMU|Dimapur Civil Airport',
            'Biju Patnaik International Airport|Bhubaneswar|Odisha|BBI|Bhubaneswar Airport',
            'Veer Surendra Sai Airport|Jharsuguda|Odisha|JRG|Jharsuguda Airport',
            'Rourkela Airport|Rourkela|Odisha|RRK|Rourkela Civil Airport',
            'Jeypore Airport|Jeypore|Odisha|PYB|Jeypore Aerodrome',
            'Utkela Airport|Utkela|Odisha|UKE|Utkela Airstrip',
            'Berhampur Airport|Berhampur|Odisha||Rangeilunda Airstrip',
            'Birasal Airport|Dhenkanal|Odisha||Birasal Airstrip',
            'Barbil Tonto Aerodrome|Barbil|Odisha||Barbil Airport',
            'Dhamra Airport|Dhamra|Odisha||Dhamra Airstrip',
            'Lanjigarh Airstrip|Lanjigarh|Odisha||Lanjigarh Airport',
            'Malkangiri Airport|Malkangiri|Odisha||Malkangiri Airstrip',
            'Puri International Airport|Puri|Odisha||Sri Jagannath International Airport',
            'Savitri Jindal Airport|Angul|Odisha||Angul Airport',
            'Tusura Airstrip|Balangir|Odisha||Balangir Airport',
            'Sri Guru Ram Dass Jee International Airport|Amritsar|Punjab|ATQ|Amritsar Airport',
            'Bathinda Airport|Bathinda|Punjab|BUP|Bathinda Civil Enclave',
            'Adampur Airport|Jalandhar|Punjab|AIP|Shri Guru Ravidas Airport',
            'Sahnewal Airport|Ludhiana|Punjab|LUH|Ludhiana Airport',
            'Pathankot Airport|Pathankot|Punjab|IXP|Pathankot Civil Airport',
            'Patiala Airport|Patiala|Punjab||Patiala Aviation Complex',
            'Beas Airport|Beas|Punjab||Radha Soami Satsang Beas Airstrip',
            'Shaheed Kartar Singh Sarabha International Airport|Ludhiana|Punjab||Halwara Airport',
            'Jaipur International Airport|Jaipur|Rajasthan|JAI|Sanganer Airport',
            'Maharana Pratap Airport|Udaipur|Rajasthan|UDR|Udaipur Airport;Dabok Airport',
            'Jodhpur Airport|Jodhpur|Rajasthan|JDH|Jodhpur Civil Airport',
            'Jaisalmer Airport|Jaisalmer|Rajasthan|JSA|Jaisalmer Civil Airport',
            'Kishangarh Airport|Ajmer|Rajasthan|KQH|Ajmer Airport',
            'Nal Airport|Bikaner|Rajasthan|BKB|Bikaner Airport',
            'Kota Airport|Kota|Rajasthan|KTU|Kota Aerodrome',
            'Banasthali Airport|Banasthali|Rajasthan||Banasthali Airstrip',
            'Kankroli Airport|Rajsamand|Rajasthan||Kankroli Airstrip',
            'Pakyong Airport|Pakyong|Sikkim|PYG|Gangtok Airport',
            'Chennai International Airport|Chennai|Tamil Nadu|MAA|Meenambakkam Airport',
            'Coimbatore International Airport|Coimbatore|Tamil Nadu|CJB|Coimbatore Airport',
            'Madurai Airport|Madurai|Tamil Nadu|IXM|Madurai Civil Airport',
            'Tiruchirappalli International Airport|Tiruchirappalli|Tamil Nadu|TRZ|Trichy Airport',
            'Salem Airport|Salem|Tamil Nadu|SXV|Salem Civil Airport',
            'Thoothukudi Airport|Thoothukudi|Tamil Nadu|TCR|Tuticorin Airport',
            'Neyveli Airport|Neyveli|Tamil Nadu|NVY|Neyveli Airstrip',
            'Hosur Aerodrome|Hosur|Tamil Nadu||Hosur Airport',
            'Thanjavur Air Force Station|Thanjavur|Tamil Nadu|TJV|Thanjavur Airport',
            'Vellore Airport|Vellore|Tamil Nadu||Vellore Airstrip',
            'Rajiv Gandhi International Airport|Hyderabad|Telangana|HYD|Hyderabad Airport;Shamshabad Airport',
            'Begumpet Airport|Hyderabad|Telangana|BPM|Hyderabad Old Airport',
            'Warangal Airport|Warangal|Telangana|WGC|Mamnoor Airport',
            'Maharaja Bir Bikram Airport|Agartala|Tripura|IXA|Agartala Airport',
            'Kailashahar Airport|Kailashahar|Tripura|IXH|Kailashahar Airstrip',
            'Kamalpur Airport|Kamalpur|Tripura||Kamalpur Airstrip',
            'Khowai Airport|Khowai|Tripura|IXN|Khowai Airstrip',
            'Chaudhary Charan Singh International Airport|Lucknow|Uttar Pradesh|LKO|Lucknow Airport',
            'Lal Bahadur Shastri International Airport|Varanasi|Uttar Pradesh|VNS|Varanasi Airport',
            'Maharishi Valmiki International Airport|Ayodhya|Uttar Pradesh|AYJ|Ayodhya Airport',
            'Prayagraj Airport|Prayagraj|Uttar Pradesh|IXD|Allahabad Airport',
            'Agra Airport|Agra|Uttar Pradesh|AGR|Kheria Airport',
            'Bareilly Airport|Bareilly|Uttar Pradesh|BEK|Bareilly Civil Enclave',
            'Gorakhpur Airport|Gorakhpur|Uttar Pradesh|GOP|Gorakhpur Civil Airport',
            'Kanpur Airport|Kanpur|Uttar Pradesh|KNU|Chakeri Airport',
            'Kushinagar International Airport|Kushinagar|Uttar Pradesh|KBK|Kushinagar Airport',
            'Hindon Airport|Ghaziabad|Uttar Pradesh|HDO|Delhi NCR Hindon Airport',
            'Noida International Airport|Jewar|Uttar Pradesh|DXN|Jewar Airport',
            'Aligarh Airport|Aligarh|Uttar Pradesh|HRH|Dhanipur Airstrip',
            'Azamgarh Airport|Azamgarh|Uttar Pradesh|AZH|Manduri Airport',
            'Chitrakoot Airport|Chitrakoot|Uttar Pradesh|CWK|Chitrakoot Dham Airport',
            'Moradabad Airport|Moradabad|Uttar Pradesh||Moradabad Airstrip',
            'Shravasti Airport|Shravasti|Uttar Pradesh||Shravasti Airstrip',
            'Fursatganj Airfield|Raebareli|Uttar Pradesh||Fursatganj Airport',
            'Sarsawa Airport|Saharanpur|Uttar Pradesh||Saharanpur Airport',
            'Muirpur Airport|Sonbhadra|Uttar Pradesh||Muirpur Airstrip',
            'Meerut Airport|Meerut|Uttar Pradesh||Dr. Bhimrao Ambedkar Airstrip',
            'Jolly Grant Airport|Dehradun|Uttarakhand|DED|Dehradun Airport',
            'Pantnagar Airport|Pantnagar|Uttarakhand|PGH|Pantnagar Civil Aerodrome',
            'Naini Saini Airport|Pithoragarh|Uttarakhand|NNS|Pithoragarh Airport',
            'Netaji Subhas Chandra Bose International Airport|Kolkata|West Bengal|CCU|Kolkata Airport;Dum Dum Airport',
            'Bagdogra International Airport|Siliguri|West Bengal|IXB|Bagdogra Airport',
            'Kazi Nazrul Islam Airport|Durgapur|West Bengal|RDP|Andal Airport',
            'Cooch Behar Airport|Cooch Behar|West Bengal|COH|Cooch Behar Civil Airport',
            'Balurghat Airport|Balurghat|West Bengal|RGH|Balurghat Airfield',
            'Behala Airport|Kolkata|West Bengal||Behala Flying Club',
            'Burnpur Airport|Asansol|West Bengal||Burnpur Airfield',
            'Malda Airport|Malda|West Bengal||Malda Airstrip'
        ].map((row) => {
            const [name, city, state, code, aliases] = row.split('|');
            return {
                name,
                city,
                state,
                code,
                aliases: aliases ? aliases.split(';').filter(Boolean) : []
            };
        });
        let activeAirportServiceMode = 'airport_drop';
