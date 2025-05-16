const updateList = [
    {
        title: "Breaking the ExaFLOPS Barrier",
        link: "https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=10793126&tag=1",
        image: "patric/images/cepi/exaflops.png",
        description: "A presentation for a scalable, end-to-end workflow for protein design. By augmenting protein sequences with natural language descriptions of their biochemical properties, the presenters train generative models that can be preferentially aligned with protein fitness landscapes."
    }
/*
    {
        title: "Influenza H5N1 2024",
        link: "https://www.bv-brc.org/outbreaks/H5N1/#view_tab=overview",
        image: "https://www.bv-brc.org/api/content/images/outbreaks/H5N1/influenza_virion_image.png",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
    {
        title: "Temp Title 1",
        link: "https://unsplash.com/photos/purple-cells-L7en7Lb-Ovc",
        image: "https://images.unsplash.com/photo-1576086213369-97a306d36557?w=800",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
    {
        title: "Temp Title 2",
        link: "https://images.unsplash.com/photo-1475906089153-644d9452ce87?w=800",
        image: "https://images.unsplash.com/photo-1475906089153-644d9452ce87?w=800",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
    {
        title: "Temp Title 3 extra long title",
        link: "https://images.unsplash.com/photo-1590859808308-3d2d9c515b1a?w=800",
        image: "https://images.unsplash.com/photo-1590859808308-3d2d9c515b1a?w=800",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
    {
        title: "Temp Title 4",
        link: "https://images.unsplash.com/photo-1595131838595-3154b9f4450b?w=800",
        image: "https://images.unsplash.com/photo-1595131838595-3154b9f4450b?w=800",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
    {
        title: "Temp Title 5",
        link: "https://images.unsplash.com/photo-1579165466741-7f35e4755660?w=800",
        image: "https://images.unsplash.com/photo-1579165466741-7f35e4755660?w=800",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    }
*/
];

let currentIndex = 0;
const updatesToShow = (updateList.length > 4) ? 4 : updateList.length;

function renderUpdates() {
    const updatesContainer = document.querySelector('#site-updates');
    updatesContainer.innerHTML = ''; // Clear existing updates

    // Create two wrapper for sliding animation
    // Using two wrappers allows for pre-loading of updates on either side of the current updates
    // to ensure no issues with rendering updates as the user scrolls
    const outerWrapper = document.createElement('div');
    outerWrapper.className = 'outer-wrapper';
    updatesContainer.appendChild(outerWrapper);

    const wrapper = document.createElement('div');
    wrapper.className = 'carousel-wrapper';

    // If there aren't enough articles, hide the arrows...
    // The event listener is because otherwise, at the time of this script, the right arrow doesn't exist yet, and doesn't get deleted.
    document.addEventListener('DOMContentLoaded', () => {
        if(updateList.length > updatesToShow) {
            const arrows = document.querySelectorAll('.carousel-button');

            arrows.forEach(arrow => {
                arrow.style.visibility = "visible";
            });
        }
    });

    // Pre-load the last/previous article if there are enough articles
    if(updatesToShow < updateList.length){
        let articleIndex = (currentIndex - 1) % updateList.length;
        articleIndex < 0 ? articleIndex = updateList.length - 1 : articleIndex;
        let article = updateList[articleIndex];

        let articleDiv = document.createElement('div');
        articleDiv.className = 'bv-brc-bottom-left card';
        articleDiv.style.flexDirection = 'column';
        articleDiv.innerHTML = `
            <div class="content-image" style="width: 200px; height: 200px;">
                <img src="${article.image}" alt="${article.title}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div class="content" style="width: fit-content; height: 200px;">
                <div class="content-description">
                    <h2><a href="${article.link}">${article.title}</a></h2>
                    <p style="text-align: left; width: fit-content;">${article.description}</p>
                </div>
            </div>
        `;
        wrapper.appendChild(articleDiv);
    }

    for (let i = 0; i < updatesToShow; i++) {
        const articleIndex = (currentIndex + i) % updateList.length;
        const article = updateList[articleIndex];

        const articleDiv = document.createElement('div');
        articleDiv.className = 'bv-brc-bottom-left card';
        articleDiv.style.flexDirection = 'column';
        articleDiv.innerHTML = `
            <div class="content-image" style="width: 200px; height: 200px;">
                <img src="${article.image}" alt="${article.title}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div class="content" style="width: fit-content; height: 200px;">
                <div class="content-description">
                    <h2><a href="${article.link}" target="_blank">${article.title}</a></h2>
                    <p style="text-align: left; width: fit-content;">${article.description}</p>
                </div>
            </div>
        `;
        wrapper.appendChild(articleDiv);
    }

    // Pre-load the next article if there's more than the carousel can show...
    if(updatesToShow < updateList.length){
        articleIndex = (currentIndex + updatesToShow) % updateList.length;
        article = updateList[articleIndex];

        articleDiv = document.createElement('div');
        articleDiv.className = 'bv-brc-bottom-left card';
        articleDiv.style.flexDirection = 'column';
        articleDiv.innerHTML = `
            <div class="content-image" style="width: 200px; height: 200px;">
                <img src="${article.image}" alt="${article.title}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div class="content" style="width: fit-content; height: 200px;">
                <div class="content-description">
                    <h2><a href="${article.link}">${article.title}</a></h2>
                    <p style="text-align: left; width: fit-content;">${article.description}</p>
                </div>
            </div>
        `;
        wrapper.appendChild(articleDiv);
    }
    outerWrapper.appendChild(wrapper);
}

function moveCarousel(direction) {
    const wrapper = document.querySelector('.carousel-wrapper');

    // Add transition class
    wrapper.style.transform = `translateX(${direction * -220}px)`; // 220px accounts for card width + gap

    // After animation completes, update the content
    setTimeout(() => {
        currentIndex = (currentIndex + direction + updateList.length) % updateList.length;
        wrapper.style.transition = 'none'; // Temporarily disable transition
        wrapper.style.transform = 'translateX(0)'; // Reset position
        renderUpdates();

        // Re-enable transition after brief delay
        setTimeout(() => {
            wrapper.style.transition = 'transform 0.3s ease';
        }, 50);
    }, 300); // Match this with the CSS transition duration
}

// Initial render
renderUpdates();