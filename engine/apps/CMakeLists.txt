add_executable(sim_runner sim_runner.cpp)
target_link_libraries(sim_runner PRIVATE engine)
find_package(Threads REQUIRED)
target_link_libraries(sim_runner PRIVATE Threads::Threads)
