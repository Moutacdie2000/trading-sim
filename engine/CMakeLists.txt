cmake_minimum_required(VERSION 3.20)
project(trading_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(ENGINE_BUILD_TESTS    "Build engine tests"           ON)
option(ENGINE_BUILD_APPS     "Build engine apps"            ON)
option(ENGINE_BUILD_BENCHES  "Build engine benchmarks"      OFF)
option(ENGINE_USE_ASAN       "Build with ASan + UBSan"      OFF)

if(MSVC)
    add_compile_options(/W4 /permissive-)
else()
    add_compile_options(
        -Wall -Wextra -Wpedantic
        -Wshadow -Wconversion -Wold-style-cast -Wnon-virtual-dtor
    )
endif()

add_library(engine
    src/order_book.cpp
    src/flow_generator.cpp
)
target_include_directories(engine PUBLIC include)

# ASan / UBSan toggle. Apply to the library and downstream targets, but skip MSVC.
if(ENGINE_USE_ASAN AND NOT MSVC)
    set(_engine_san_flags -fsanitize=address,undefined -fno-omit-frame-pointer)
    target_compile_options(engine PUBLIC ${_engine_san_flags})
    target_link_options   (engine PUBLIC ${_engine_san_flags})
endif()

if(ENGINE_BUILD_TESTS)
    include(FetchContent)
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG        v1.14.0
    )
    set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(googletest)
    enable_testing()
    add_subdirectory(tests)
endif()

if(ENGINE_BUILD_APPS)
    add_subdirectory(apps)
endif()

if(ENGINE_BUILD_BENCHES)
    add_subdirectory(benchmarks)
endif()
