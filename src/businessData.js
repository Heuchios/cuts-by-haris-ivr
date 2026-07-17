const business = {
  name: "Cuts By Haris",
  timezone: "America/Regina",
  hours: {
    openDays: [0, 1, 2, 3, 4, 5, 6],
    open: "09:00",
    close: "18:00"
  },
  categories: [
    {
      digit: "1",
      key: "haircut",
      name: "Haircut",
      services: [
        {
          digit: "1",
          key: "skin-fade",
          name: "Skin fade",
          speechName: "skin fade",
          durationMinutes: 40,
          priceDollars: 35
        },
        {
          digit: "2",
          key: "regular-haircut-no-fade",
          name: "Haircut regular cut 30min - no fade",
          speechName: "regular haircut, no fade",
          durationMinutes: 30,
          priceDollars: 35
        },
        {
          digit: "3",
          key: "haircut-and-beard",
          name: "Haircut and Beard",
          speechName: "haircut and beard",
          durationMinutes: 60,
          priceDollars: 55
        },
        {
          digit: "4",
          key: "buzz-cut",
          name: "Buzz Cut",
          speechName: "buzz cut",
          durationMinutes: 30,
          priceDollars: 30
        },
        {
          digit: "5",
          key: "long-haircut-scissors",
          name: "Long haircut (scissors cut)",
          speechName: "long haircut",
          durationMinutes: 40,
          priceDollars: 35
        }
      ]
    },
    {
      digit: "2",
      key: "beard",
      name: "Beard",
      services: [
        {
          digit: "1",
          key: "regular-beard-trim-no-fade",
          name: "Beard trim regular - line up with trimmers, no fade",
          speechName: "regular beard trim, line up with trimmers, no fade",
          durationMinutes: 20,
          priceDollars: 15
        },
        {
          digit: "2",
          key: "beard-trim-fade-razor-lineup",
          name: "Beard trim fade and razor lineup",
          speechName: "beard trim fade and razor lineup",
          durationMinutes: 30,
          priceDollars: 20
        }
      ]
    },
    {
      digit: "3",
      key: "perm",
      name: "Perm",
      services: [
        {
          digit: "1",
          key: "perm",
          name: "Perm",
          speechName: "perm",
          durationMinutes: 120,
          priceDollars: 130
        }
      ]
    },
    {
      digit: "4",
      key: "kids",
      name: "Kids",
      services: [
        {
          digit: "1",
          key: "kids-regular-cut-no-fade",
          name: "Kids regular cut - no fade - 10 and under",
          speechName: "kids regular cut, no fade, 10 and under",
          durationMinutes: 30,
          priceDollars: 30
        },
        {
          digit: "2",
          key: "kids-fade",
          name: "Kids fade",
          speechName: "kids fade",
          durationMinutes: 35,
          priceDollars: 35
        }
      ]
    },
    {
      digit: "5",
      key: "seniors",
      name: "Seniors",
      services: [
        {
          digit: "1",
          key: "seniors",
          name: "Seniors",
          speechName: "seniors cut",
          durationMinutes: 30,
          priceDollars: 30
        }
      ]
    }
  ]
};

function getCategoryByDigit(digit) {
  return business.categories.find((category) => category.digit === digit) || null;
}

function getCategoryByKey(key) {
  return business.categories.find((category) => category.key === key) || null;
}

function getServiceByDigit(categoryKey, digit) {
  const category = getCategoryByKey(categoryKey);
  if (!category) return null;
  return category.services.find((service) => service.digit === digit) || null;
}

function getServiceByKey(serviceKey) {
  for (const category of business.categories) {
    const service = category.services.find((item) => item.key === serviceKey);
    if (service) {
      return { category, service };
    }
  }
  return null;
}

function listServices() {
  return business.categories.flatMap((category) => category.services);
}

module.exports = {
  business,
  getCategoryByDigit,
  getCategoryByKey,
  getServiceByDigit,
  getServiceByKey,
  listServices
};
